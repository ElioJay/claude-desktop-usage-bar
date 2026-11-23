# Claude Desktop 用量条

在 Claude Desktop 的「Code」页输入框上方显示当前会话的模型用量。插件只读取 Claude Code 已有的用量数据。

## 安装到本机

在仓库根目录打开 PowerShell 并运行以下命令。安装完成后，在 Claude Desktop 新建一个本地「Code」会话并发一条消息，收到回复后即可看到用量。

```powershell
claude plugin install desktop-usage-bar --marketplace "$($PWD.Path)" --scope user
```

## 指标口径

打开已有会话时，插件读取一次该会话的本地记录。运行期间用量条随新增请求更新，只把统计数字保存在本机。

- **轮 / 步**显示主会话轮次及最后一轮的模型请求次数。历史记录按请求和模型消息 ID 去重。
- **tok/s**显示主会话最近一次成功测速的模型请求的输出速度，按输出 token 数除以请求耗时计算，耗时包含首 token 等待。生成期间保留上次结果，重新打开会话时恢复已保存的速度。没有测速记录时暂不显示。
- **tok / 圆环百分比**显示最近一次上下文 token 数及其占模型窗口的比例。
- **缓存**是最近一次有用量记录的模型请求中，缓存读取 token 占全部输入 token 的比例。

## 卸载

```powershell
claude plugin uninstall 'desktop-usage-bar@desktop-local-plugins' --scope user
```
