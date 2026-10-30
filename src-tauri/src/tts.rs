use std::ffi::c_void;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Media::Speech::{
    ISpObjectToken, ISpObjectTokenCategory, ISpVoice, SpObjectTokenCategory, SpVoice, SPCAT_VOICES,
    SPF_ASYNC, SPF_PURGEBEFORESPEAK, SPRS_DONE, SPVOICESTATUS,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
};

const POLL_INTERVAL: Duration = Duration::from_millis(30);

#[derive(Clone, Debug, Serialize)]
pub struct TtsVoice {
    pub id: String,
    pub name: String,
    pub lang: String,
}

struct VoiceEntry {
    info: TtsVoice,
    token: ISpObjectToken,
}

pub enum Command {
    List(Sender<Result<Vec<TtsVoice>, String>>),
    Speak {
        text: String,
        voice_id: Option<String>,
        rate: f32,
        volume: f32,
        done: Sender<Result<(), String>>,
    },
    Stop,
}

pub struct TtsState {
    sender: Sender<Command>,
}

impl TtsState {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        let _ = thread::Builder::new()
            .name("typeword-sapi".to_string())
            .spawn(move || run(receiver));
        Self { sender }
    }

    pub fn sender(&self) -> Sender<Command> {
        self.sender.clone()
    }

    pub fn send(&self, command: Command) -> Result<(), String> {
        self.sender
            .send(command)
            .map_err(|_| "系统语音服务未启动".to_string())
    }
}

struct ActiveSpeech {
    done: Sender<Result<(), String>>,
    stream: u32,
    started: Instant,
    _text: Vec<u16>,
}

fn run(receiver: Receiver<Command>) {
    let initialized = unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            Err("无法初始化系统语音组件".to_string())
        } else {
            CoCreateInstance::<_, ISpVoice>(
                &SpVoice,
                None::<&windows::core::IUnknown>,
                CLSCTX_ALL,
            )
            .map_err(|_| "无法创建系统语音引擎".to_string())
        }
    };

    let (engine, init_error) = match initialized {
        Ok(engine) => (Some(engine), None),
        Err(message) => (None, Some(message)),
    };
    let mut catalog: Vec<VoiceEntry> = Vec::new();
    let mut active: Option<ActiveSpeech> = None;

    loop {
        let command = if active.is_some() {
            match receiver.recv_timeout(POLL_INTERVAL) {
                Ok(command) => Some(command),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        } else {
            match receiver.recv() {
                Ok(command) => Some(command),
                Err(_) => break,
            }
        };

        if let Some(command) = command {
            handle_command(command, &engine, &init_error, &mut catalog, &mut active);
        }

        if let Some(current) = active.as_ref() {
            let finished = current.started.elapsed() >= Duration::from_millis(60)
                && match engine.as_ref() {
                    Some(engine) => speech_finished(engine, current.stream),
                    None => true,
                };
            if finished {
                if let Some(current) = active.take() {
                    let _ = current.done.send(Ok(()));
                }
            }
        }
    }
}

fn handle_command(
    command: Command,
    engine: &Option<ISpVoice>,
    init_error: &Option<String>,
    catalog: &mut Vec<VoiceEntry>,
    active: &mut Option<ActiveSpeech>,
) {
    match command {
        Command::List(reply) => {
            let _ = reply.send(list_voices(engine, init_error, catalog));
        }
        Command::Speak {
            text,
            voice_id,
            rate,
            volume,
            done,
        } => {
            finish_active(engine, active);
            let Some(engine) = engine.as_ref() else {
                let _ = done.send(Err(init_error
                    .clone()
                    .unwrap_or_else(|| "系统语音不可用".to_string())));
                return;
            };
            match start_speech(engine, catalog, &text, voice_id.as_deref(), rate, volume) {
                Ok((stream, buffer)) => {
                    *active = Some(ActiveSpeech {
                        done,
                        stream,
                        started: Instant::now(),
                        _text: buffer,
                    });
                }
                Err(message) => {
                    let _ = done.send(Err(message));
                }
            }
        }
        Command::Stop => finish_active(engine, active),
    }
}

fn finish_active(engine: &Option<ISpVoice>, active: &mut Option<ActiveSpeech>) {
    let Some(current) = active.take() else {
        return;
    };
    if let Some(engine) = engine.as_ref() {
        unsafe {
            let _ = engine.Speak(PCWSTR::null(), SPF_PURGEBEFORESPEAK.0 as u32, None);
        }
    }
    let _ = current.done.send(Ok(()));
}

fn list_voices(
    engine: &Option<ISpVoice>,
    init_error: &Option<String>,
    catalog: &mut Vec<VoiceEntry>,
) -> Result<Vec<TtsVoice>, String> {
    if engine.is_none() {
        return Err(init_error
            .clone()
            .unwrap_or_else(|| "系统语音不可用".to_string()));
    }
    ensure_catalog(catalog)?;
    Ok(catalog.iter().map(|entry| entry.info.clone()).collect())
}

fn ensure_catalog(catalog: &mut Vec<VoiceEntry>) -> Result<(), String> {
    if !catalog.is_empty() {
        return Ok(());
    }
    *catalog = load_catalog().map_err(|_| "无法读取 Windows 系统语音".to_string())?;
    Ok(())
}

fn load_catalog() -> windows::core::Result<Vec<VoiceEntry>> {
    unsafe {
        let category: ISpObjectTokenCategory = CoCreateInstance(
            &SpObjectTokenCategory,
            None::<&windows::core::IUnknown>,
            CLSCTX_ALL,
        )?;
        category.SetId(SPCAT_VOICES, false)?;
        let tokens = category.EnumTokens(PCWSTR::null(), PCWSTR::null())?;

        let mut count = 0u32;
        tokens.GetCount(&mut count)?;

        let mut entries = Vec::new();
        for index in 0..count {
            let Ok(token) = tokens.Item(index) else {
                continue;
            };
            let Some(id) = read_allocated(token.GetId().ok()) else {
                continue;
            };
            let language = read_string(&token, windows::core::w!("Language"))
                .or_else(|| read_string(&token, windows::core::w!("Locale")))
                .as_deref()
                .and_then(parse_language_id)
                .map(language_tag)
                .or_else(|| infer_language(&id));
            let Some(lang) = language else {
                continue;
            };
            if !lang.to_ascii_lowercase().starts_with("en") {
                continue;
            }
            let name = read_string(&token, PCWSTR::null())
                .filter(|value| !value.trim().is_empty())
                .or_else(|| read_string(&token, windows::core::w!("Name")))
                .unwrap_or_else(|| id.clone());
            entries.push(VoiceEntry {
                info: TtsVoice { id, name, lang },
                token,
            });
        }
        Ok(entries)
    }
}

fn start_speech(
    engine: &ISpVoice,
    catalog: &mut Vec<VoiceEntry>,
    text: &str,
    voice_id: Option<&str>,
    rate: f32,
    volume: f32,
) -> Result<(u32, Vec<u16>), String> {
    ensure_catalog(catalog)?;
    if catalog.is_empty() {
        return Err("系统没有可用的英文语音".to_string());
    }

    let index = pick_voice_index(catalog, voice_id);
    let entry = &catalog[index];
    unsafe {
        engine
            .SetVoice(&entry.token)
            .map_err(|_| "无法使用所选系统语音".to_string())?;
        engine
            .SetRate(map_rate(rate))
            .map_err(|_| "无法设置系统语音语速".to_string())?;
        engine
            .SetVolume(map_volume(volume))
            .map_err(|_| "无法设置系统语音音量".to_string())?;
    }

    let mut buffer: Vec<u16> = text.encode_utf16().collect();
    buffer.push(0);
    let mut stream = 0u32;
    let flags = (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32;
    unsafe {
        engine
            .Speak(PCWSTR::from_raw(buffer.as_ptr()), flags, Some(&mut stream))
            .map_err(|_| "系统语音朗读失败".to_string())?;
    }
    Ok((stream, buffer))
}

fn pick_voice_index(catalog: &[VoiceEntry], voice_id: Option<&str>) -> usize {
    pick_voice_position(catalog.iter().map(|entry| entry.info.id.as_str()), voice_id)
}

fn pick_voice_position<'a>(
    mut ids: impl Iterator<Item = &'a str>,
    voice_id: Option<&str>,
) -> usize {
    voice_id
        .and_then(|id| ids.position(|candidate| candidate.eq_ignore_ascii_case(id)))
        .unwrap_or(0)
}

fn speech_finished(engine: &ISpVoice, stream: u32) -> bool {
    let mut status = SPVOICESTATUS::default();
    let mut bookmark = PWSTR::null();
    let result = unsafe { engine.GetStatus(&mut status, &mut bookmark) };
    if !bookmark.is_null() {
        unsafe {
            CoTaskMemFree(Some(bookmark.0 as *const c_void));
        }
    }
    if result.is_err() {
        return true;
    }
    status.dwRunningState == SPRS_DONE.0 as u32 && status.ulCurrentStream >= stream
}

unsafe fn read_allocated(value: Option<PWSTR>) -> Option<String> {
    let value = value?;
    let text = value.to_string().ok();
    unsafe {
        CoTaskMemFree(Some(value.0 as *const c_void));
    }
    text
}

unsafe fn read_string(token: &ISpObjectToken, name: PCWSTR) -> Option<String> {
    let value = token.GetStringValue(name).ok()?;
    let text = value.to_string().ok();
    unsafe {
        CoTaskMemFree(Some(value.0 as *const c_void));
    }
    text
}

fn parse_language_id(value: &str) -> Option<u32> {
    let trimmed = value.trim();
    let hex = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed);
    u32::from_str_radix(hex, 16).ok()
}

fn language_tag(lcid: u32) -> String {
    match lcid {
        0x0409 => "en-US",
        0x0809 => "en-GB",
        0x0c09 => "en-AU",
        0x1009 => "en-CA",
        0x1409 => "en-NZ",
        0x1809 => "en-IE",
        0x1c09 => "en-ZA",
        0x2009 => "en-JM",
        0x2409 => "en-029",
        0x2809 => "en-BZ",
        0x2c09 => "en-TT",
        0x3009 => "en-ZW",
        0x3409 => "en-PH",
        0x3c09 => "en-IN",
        0x4009 => "en-SG",
        0x4409 => "en-MY",
        _ => "en",
    }
    .to_string()
}

fn infer_language(id: &str) -> Option<String> {
    let lower = id.to_ascii_lowercase();
    if lower.contains("en-us") || lower.contains("en_us") {
        Some("en-US".to_string())
    } else if lower.contains("en-gb") || lower.contains("en_gb") {
        Some("en-GB".to_string())
    } else if lower.contains("en-") || lower.contains("en_") {
        Some("en".to_string())
    } else {
        None
    }
}

fn map_rate(rate: f32) -> i32 {
    let rate = if rate.is_finite() { rate } else { 1.0 };
    (((rate.clamp(0.5, 1.5) - 1.0) * 20.0).round() as i32).clamp(-10, 10)
}

fn map_volume(volume: f32) -> u16 {
    let volume = if volume.is_finite() { volume } else { 1.0 };
    (volume.clamp(0.0, 1.0) * 100.0).round() as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sapi_language_ids() {
        assert_eq!(parse_language_id("409"), Some(0x0409));
        assert_eq!(parse_language_id("0x809"), Some(0x0809));
        assert_eq!(parse_language_id("not-hex"), None);
    }

    #[test]
    fn maps_english_locales() {
        assert_eq!(language_tag(0x0409), "en-US");
        assert_eq!(language_tag(0x0809), "en-GB");
        assert_eq!(language_tag(0x1234), "en");
    }

    #[test]
    fn infers_language_from_token_id() {
        assert_eq!(infer_language("TTS_MS_EN-US_ZIRA_11.0"), Some("en-US".to_string()));
        assert_eq!(infer_language("TTS_MS_EN-GB_HAZEL_11.0"), Some("en-GB".to_string()));
        assert_eq!(infer_language("TTS_MS_ZH-CN_HUIHUI_11.0"), None);
    }

    #[test]
    fn maps_speech_rate_and_volume_to_sapi_scale() {
        assert_eq!(map_rate(0.5), -10);
        assert_eq!(map_rate(0.9), -2);
        assert_eq!(map_rate(1.0), 0);
        assert_eq!(map_rate(1.5), 10);
        assert_eq!(map_volume(0.0), 0);
        assert_eq!(map_volume(0.55), 55);
        assert_eq!(map_volume(1.0), 100);
    }

    #[test]
    fn falls_back_to_first_voice_when_id_is_missing() {
        let ids = ["zira", "hazel"];

        assert_eq!(pick_voice_position(ids.iter().copied(), None), 0);
        assert_eq!(pick_voice_position(ids.iter().copied(), Some("hazel")), 1);
        assert_eq!(pick_voice_position(ids.iter().copied(), Some("HAZEL")), 1);
        assert_eq!(pick_voice_position(ids.iter().copied(), Some("missing")), 0);
    }

    #[test]
    #[ignore = "需要本机安装 SAPI 英文语音与音频输出"]
    fn speaks_with_a_real_sapi_voice() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut catalog = load_catalog().expect("读取 SAPI 语音");
        if catalog.is_empty() {
            return;
        }
        let engine: ISpVoice = unsafe {
            CoCreateInstance(&SpVoice, None::<&windows::core::IUnknown>, CLSCTX_ALL)
        }
        .expect("创建 SAPI 语音引擎");
        let (stream, _buffer) =
            start_speech(&engine, &mut catalog, "typeword test", None, 1.0, 0.0)
                .expect("启动 SAPI 朗读");

        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if speech_finished(&engine, stream) {
                return;
            }
            thread::sleep(Duration::from_millis(30));
        }
        panic!("SAPI 朗读未在 5 秒内结束");
    }
}
