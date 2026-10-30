import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface ImportGuideModalProps {
  onClose: () => void;
}

const MINIMAL_STRUCTURE = `// 写法一：单词数组
[
  { "word": "reflection", "meanings": ["反射", "倒影"] },
  { "word": "slender", "meanings": ["苗条的"] }
]

// 写法二：包含 words 数组的对象
{
  "words": [
    { "word": "reflection", "meanings": ["反射", "倒影"] }
  ]
}`;

const FULL_EXAMPLE = `[
  {
    "word": "reflection",
    "meanings": ["反射", "倒影", "深思"],
    "phonetic": "/rɪˈflekʃn/",
    "acceptedAnswers": [],
    "exampleSentence": "She paused for reflection.",
    "notes": "reflect v. 反射；reflective adj. 沉思的",
    "category": "核心词汇",
    "tags": ["考研", "名词"],
    "difficulty": 3,
    "enabled": true,
    "dictationEnabled": true,
    "studyEnabled": true
  }
]`;

export function ImportGuideModal({ onClose }: ImportGuideModalProps) {
  return (
    <Modal
      open
      wide
      title="批量导入格式说明"
      subtitle="JSON 文件支持两种根结构；每个词条至少包含 word 与 meanings。"
      onClose={onClose}
      footer={
        <div className="form-actions">
          <Button variant="primary" onClick={onClose}>
            知道了
          </Button>
        </div>
      }
    >
      <div className="import-guide">
        <section>
          <h3>文件结构</h3>
          <p>
            根节点可以是单词数组，也可以是包含 <code>words</code> 数组的对象。两种写法导入效果相同。
          </p>
          <pre className="code-block">{MINIMAL_STRUCTURE}</pre>
        </section>

        <section>
          <h3>必填字段</h3>
          <table className="import-guide__table">
            <thead>
              <tr>
                <th>字段</th>
                <th>类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>word</code>
                </td>
                <td>string</td>
                <td>英文单词或短语，不能为空</td>
              </tr>
              <tr>
                <td>
                  <code>meanings</code>
                </td>
                <td>string[]</td>
                <td>中文释义，至少一条；也可以直接写一个字符串</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>可选字段</h3>
          <table className="import-guide__table">
            <thead>
              <tr>
                <th>字段</th>
                <th>类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>acceptedAnswers</code>
                </td>
                <td>string[]</td>
                <td>备用答案，例如拼写变体（colour / color）</td>
              </tr>
              <tr>
                <td>
                  <code>phonetic</code>
                </td>
                <td>string</td>
                <td>音标</td>
              </tr>
              <tr>
                <td>
                  <code>exampleSentence</code>
                </td>
                <td>string</td>
                <td>例句，答案揭晓后展示</td>
              </tr>
              <tr>
                <td>
                  <code>notes</code>
                </td>
                <td>string</td>
                <td>词形变化或备注</td>
              </tr>
              <tr>
                <td>
                  <code>category</code>
                </td>
                <td>string</td>
                <td>分类，默认「核心词汇」</td>
              </tr>
              <tr>
                <td>
                  <code>tags</code>
                </td>
                <td>string[]</td>
                <td>标签，用于搜索与筛选</td>
              </tr>
              <tr>
                <td>
                  <code>difficulty</code>
                </td>
                <td>1–5</td>
                <td>难度，默认 2</td>
              </tr>
              <tr>
                <td>
                  <code>enabled</code>
                </td>
                <td>boolean</td>
                <td>是否加入练习池，默认 true</td>
              </tr>
              <tr>
                <td>
                  <code>dictationEnabled</code>
                </td>
                <td>boolean</td>
                <td>是否加入听写池，默认与练习勾选一致</td>
              </tr>
              <tr>
                <td>
                  <code>studyEnabled</code>
                </td>
                <td>boolean</td>
                <td>是否出现在翻卡学习，默认 true；与练习勾选相互独立</td>
              </tr>
              <tr>
                <td>
                  <code>dictationState</code>
                </td>
                <td>object</td>
                <td>听写池的独立进度（导出文件自动包含）；同名单词更新时保留本机现有听写状态</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>完整示例</h3>
          <pre className="code-block">{FULL_EXAMPLE}</pre>
        </section>

        <section>
          <h3>规则提醒</h3>
          <ul className="import-guide__notes">
            <li>
              同名单词不会重复添加。文件中带 <code>weight</code>、<code>nextReviewAt</code> 等进度字段时
              会更新已有词条，否则直接跳过；进度字段也可以放在 <code>state</code> 对象中。
            </li>
            <li>文件内出现重复单词时，仅保留第一条。</li>
            <li>
              分组不会随 JSON 导入或导出；导入前可选择新建分组并放入本次新增词条，导入后也可到词库批量调整。
            </li>
            <li>无法解析或缺少必填字段的记录会被跳过，并在导入结果中逐条说明。</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
