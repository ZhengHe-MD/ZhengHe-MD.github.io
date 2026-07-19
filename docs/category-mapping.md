# 类目映射表（迁移评审用）

> 49 篇旧博文从 6 个旧类目归入统一的 思考 / 实践 二类体系（design brief §6）。
> 每篇均基于内容判断（build/do → 实践；read/reflect/analyze → 思考），非按旧标签盲目合并。
> **请作者评审此表；改动某篇的类目 = 直接修改对应 writing/<slug>/index.html 里的 <meta name="category">。**

| 文件 | 标题 | 旧类目 | 新类目 | 依据 |
|---|---|---|---|---|
| 24 | 纸牌游戏：24 | 实践 | **实践** | 作者动手实现了一个用搜索算法求解 24 点问题的 Go 程序 |
| A-B-Testing | 一次实验、两种错误、三个直觉 | 实践 | **实践** | 详细走完了计算样本量、上线分流、用自建 Colab 工具跑假设检验的完整实操流程 |
| accuracy-and-precision | 捋一捋 Accuracy 与 Precision 间的区别和联系 | 思考 | **思考** | 梳理两个概念的区别与联系，属于概念辨析类思考 |
| ai-augmented-engineer | AI 究竟在缩小还是放大软件工程师之间的差距？ | 思考 | **思考** | 围绕 AI 对工程师能力差距影响展开的观点性思辨文章 |
| apache-arrow-summary | TiDB 为什么要用 Apache Arrow - 一个门外汉的思考 | 系统设计 | **思考** | 阅读 TiDB 源码和 Arrow 文档后整理的调研小结，属于阅读分析 |
| born-a-crime | Born a Crime - 崔娃语录谈 | 读书 | **思考** | 读书笔记，摘录语录并分享感想 |
| Cache-Policies | 缓存管理策略综述 | 系统设计 | **思考** | 对各类 Cache Policy/一致性协议做的理论综述，非动手构建 |
| compound-interest-in-life | 复利的隐喻 | 思考 | **思考** | 以复利概念隐喻人生坚持的个人感悟随笔 |
| Consistent-Hashing-and-Random-Trees-1997 | Consistent Hashing and Random Trees (1997) | 论文 | **思考** | 论文内容的复述与分析总结 |
| danger-thoughts | Software Engineering at Google - 阻碍工程师成长的几种想法 | 读书 | **思考** | 读书笔记，结合自身经历反思工程师常见思维误区 |
| Dapper-a-Large-Scale-Distributed-Systems-Tracing-Infrastructure-2010 | Dapper, a Large-Scale Distributed Systems Tracing Infrastructure (2010) | 论文 | **思考** | 对 Dapper 论文设计思路的重述与分析 |
| design-dimensions-of-tracing-systems | 调用链追踪系统的设计维度 | 系统设计 | **思考** | 提出分析框架并用其解构调用链追踪系统，属于概念性综述 |
| dialogue-system-research | 对话系统-101 | 系统设计 | **思考** | 两周调研对话系统后整理的调研报告，介绍背景概念而非自建系统 |
| Distributed-Locking | 分布式锁方案：效率与正确的权衡 | 系统设计 | **思考** | 深入调研并比较各类分布式锁方案的权衡取舍，属于分析综述 |
| Dynamic-Hash-Tables-1988 | Dynamic Hash Tables (1988) | 论文 | **思考** | 论文摘要与内容的复述分析 |
| Go-Error-Handling-Research | 如何在 Golang 项目中处理好错误 | 编程 | **实践** | 在调研基础上给出可直接落地的错误处理实战方法论与代码模式 |
| go-project-layout | 中小型 Go 语言项目应该如何布局？ | 编程 | **实践** | 以真实项目为例给出团队实践超一年的具体分层布局实现方案 |
| Gorilla-A-Fast-Scalable-In-Memory-Time-Series-Database-2015 | Gorilla: A Fast, Scalable, In-Memory Time Series Database (2015) | 论文 | **思考** | 对 Facebook 时序数据库论文的翻译与解读，属于阅读分析类内容 |
| I-❤-Logs-小结 | I ❤ Logs - 以日志为中心的系统设计理念 | 读书 | **思考** | 书籍读后梳理与观点总结，属于读书笔记 |
| implementing-tail-based-sampling | 调用链追踪系统在伴鱼：实践篇 | 系统设计 | **实践** | 记录团队在生产环境中动手改造、实现尾部采样系统的工程实践 |
| Jaeger-Walkthrough-jaeger-client-go | Jaeger 的 Go 客户端的源码导读 | 编程 | **思考** | 对开源项目源码的逐模块解读分析，属于源码分析类 |
| juan | 为什么要「卷」 | 思考 | **思考** | 对内卷现象的个人观点与思考随笔 |
| Kafka-a-Distributed-Messaging-System-for-Log-Processing-2011 | Kafka: a Distributed Messaging System for Log Processing (2011) | 论文 | **思考** | 对 Kafka 论文的翻译解读与背景补充，属于阅读分析 |
| LFU-Implementation-With-O-1-Complexity-2010 | LFU Implementation With O(1) Complexity (2010) | 论文 | **思考** | 对 LFU 算法论文的总结解读，属于阅读分析类 |
| Log-Structured-Merge-LSM-Tree-Usages-in-KV-Stores | 用 LSM Tree 实现一个键值数据库 —— GopherConf 2017 演讲笔记 | 系统设计 | **思考** | 整理演讲内容与 LSM 树原理、case study 的笔记，作者本人未动手实现 |
| Make-It-Stick-Digest | Make It Stick - 学习本身是一件值得思考的事情 | 读书 | **思考** | 书籍读后感与类比思考，属于读书笔记 |
| map-reduce-from-scratch | 从 MapReduce 到 SQL | 实践 | **实践** | 作者用 Go 从零实现玩具版 MapReduce 引擎并支持 SQL 语义，动手实现型项目 |
| my-first-agent-skill | 我的第一个 AgentSkill | 实践 | **实践** | 记录作者动手开发、迭代并发布 AgentSkill 的全过程 |
| my-takes-on-interviews | 面试官毁掉技术面试的三大法宝 | 思考 | **思考** | 基于面试经历的观点性分析与思考 |
| no-admin-ui | 面向工程师的内部系统需要 Web 界面吗？ | （无） | **思考** | 关于内部系统设计方案的思辨性观点文章 |
| On-Let-s-Build-A-Simple-Interpreter | 从头开始构建一个 Pascal 的解释器 | 实践 | **实践** | 作者跟随教程用 Go 动手实现了 Pascal 解释器并开源 |
| pythagorean-ankle | 用勾股定理画脚踝 | 思考 | **思考** | 由 AI 对话引发的关于 AI 认知能力的思考随笔 |
| quick-translate | 翻译能有多快？在 Mac 上实现一键翻译 | 实践 | **实践** | 作者动手用 Automator/Keyboard 工具搭建一键翻译方案的实践记录 |
| relationship | 猫和女儿教会我的道理 | 思考 | **思考** | 个人生活感悟与反思性随笔 |
| repeat-after-me | 我开发的口语跟读练习工具 RAM | 实践 | **实践** | 记录自己开发命令行工具 RAM 的过程 |
| rnn | 从头开始实现 RNN | 实践 | **实践** | 从零动手实现 vanilla RNN 和 LSTM 的实践记录 |
| rubiks-cube | 两年魔方速拧路，体验优化的艺术 | 实践 | **实践** | 记录亲自练习魔方速拧、动手提升技艺的过程 |
| Scaling-Memcache-at-Facebook-2013 | Scaling Memcache at Facebook (2013) | 论文 | **思考** | 论文内容转述与分析 |
| search-engine-for-codes-fundamentals | 代码搜索引擎：基础篇 | 系统设计 | **思考** | 介绍代码搜索引擎的背景与基础原理，属于知识综述（落地实操在后续篇） |
| so-you-want-to-trace-your-distributed-system-key-design-insights-from-years-of-practical-experience | So, you want to trace your distributed system? (2014) | 论文 | **思考** | 论文内容转述与分析 |
| the-anatomy-of-a-large-scale-hypertextual-web-search-engine-1998 | The Anatomy of a Large-Scale Hypertextual Web Search Engine (1998) | 论文 | **思考** | 论文内容转述与分析 |
| the-equator | 赤道计划 | 实践 | **实践** | 记录搭建赤道计划网站并用 running_page 实现数据自动同步的动手过程 |
| The-Evolution-of-Alertmanager-Matcher-in-Palfish | 报警平台的匹配器演进 | 系统设计 | **实践** | 记录作者在伴鱼用 Lex/Yacc 实际构建匹配器编译器的工程实践 |
| The-Evolution-of-Prometheus-Storage-Layer | Prometheus TSDB 的存储层演进 —— PromConf 演讲笔记 | 系统设计 | **思考** | 整理自他人演讲与文档的知识总结，非作者自己动手构建 |
| The-Most-Beautiful-Program-Ever-Written | 最美的程序：用 Lisp 写的 Lisp 解释器 | 编程 | **思考** | 解读他人代码（pmatch/Lisp 解释器）的源码分析 |
| Time-Clocks-and-the-Ordering-of-Events-in-a-Distributed-System-1978 | Time, Clocks, and the Ordering of Events in a Distributed System (1978) | 论文 | **思考** | 经典论文的解读与转述 |
| Understanding-Prometheus-Alertmanager | Prometheus Alertmanager 的源码导读 | 编程 | **思考** | 对 Alertmanager 源码的阅读与架构分析 |
| What-s-Really-New-with-NewSQL-2016 | What's Really New with NewSQL (2016) | 论文 | **思考** | 论文的翻译与解读 |
| x-and-y-sounds-in-language | 我明明是福建人，为什么别人以为我是胡建人？ | 思考 | **思考** | 由《Fluent Forever》一书引发的语言现象观察与思考 |

统计：思考 35 篇 · 实践 14 篇 · 共 49 篇
