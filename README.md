# Daniel Alabi — AI agent implementation index

Portfolio demos, experiments, and supporting material for engineering, energy, industrial operations, and research workflows. The labels below describe the checked-in implementation, not production readiness.

## Hiring-manager review path

1. **[SCADA Historian Analyst](scada-historian-agent.html):** load the built-in demo, inspect anomaly detection/correlation, and export a report. Analysis runs locally without a model API key.
2. **Retrieval:** compare browser [BM25 and citation rendering](rag-citation-agent.html) with Python [embeddings, retrieval, and prompt construction](minimal_rag.py).
3. **Domain design:** read the structured report prompt in the [NDT component](ndt-report-agent.jsx), then inspect the simulated [BESS dashboard](bess_dispatch_trading_platform.html).

## Engineering and energy

| Entry point | Implementation and scope |
| --- | --- |
| [BESS dispatch and trading](bess_dispatch_trading_platform.html) | **Simulation demo.** Generated prices, rule-based charge/discharge decisions, state-of-charge displays, and model-backed chat. No live market or battery connection. |
| [Physical-world sensing](physical_world_sensing_agent.html) | **Simulation demo.** Sensor charts, threshold alerts, and model-backed Q&A/reports. CSV/JSON ingestion only parses or counts input; the displayed feed remains simulated. |

## SCADA and NDT

| Entry point | Implementation and scope |
| --- | --- |
| [SCADA Historian Analyst](scada-historian-agent.html) | **Browser demo.** CSV/sample data, statistical outliers, spikes, flatlines, custom limits, baseline files, scan-window correlation, charts, and text-report export. No live historian connector. |
| [NDT report agent](ndt-report-agent.jsx) | **React component.** Inspection notes to a structured JSON report and rendered findings. Requires a React host and authenticated model API integration. |
| [Holdpoint](holdpoint.html) | **Approval-workflow demo.** Simulated SCADA and other scenarios illustrate confidence thresholds, human approval, resume/reject behavior, and a browser audit log. Optional model-backed mode needs API integration. |

## Research and citation workflows

| Entry point | Implementation and scope |
| --- | --- |
| [Grounded citation agent](rag-citation-agent.html) | **Browser demo.** Text chunking, local BM25 retrieval, citation-linked evidence, and an offline extractive fallback. Model generation and web-search fallback need API integration. |
| [Research paper review](research_paper_review_agent_fixed.html) | **HTML UI demo.** Sample papers, PDF upload, section reviews, comparison, and citation formatting. Model-backed actions need API integration; “send to chat” also expects a host-provided callback. |
| [Minimal RAG](minimal_rag.py) · [notes](minimal_rag_README.md) | **Python demo.** Sentence-transformer embeddings and NumPy cosine retrieval over an included corpus. Without `ANTHROPIC_API_KEY`, it prints retrieved context. |
| [Paper review dashboard](paper_review_dashboard.py) | **Partial artifact.** HTTP upload/report UI that imports `paper_review_agent.py`, which is absent from this repository. It cannot run as supplied. |
| [Scientific discovery workflow](scientific-discovery-agent-no-key.zip) | **Packaged React/Vite demo.** Literature notes, hypotheses, experiment-design forms, and template-based text export. No automated search or model calls. Archived entry: `sda-static/src/App.jsx`. |
| [Recommendation and reading lists](advanced_recommendation_system.html) | **Mock-data demo.** Browser-persisted reading lists, team voting, and approval screens built around canned recommendations. |

## Supporting and miscellaneous material

| Material | Entry points and status |
| --- | --- |
| Data analysis | [Local statistics and charts](data-analysis-agent-local.html); model-backed [analysis UI](data-analysis-agent.html) and [v3 UI](data_analysis_agent_v3.html). **Browser demos** with different implementations. |
| Writing, coding, and memory | [Galley](galley.html), [document compression](document-compression-agent.html), [algorithm to code](algorithm-to-code.html), and [Engram](engram.html). **API-backed demos.** |
| Reasoning and document review | [Solon](solon_ethical_reasoning_agent.html) and [legal compliance UI](legal_compliance_intelligence_agent.html). **API-backed demos.** |
| Other React components | [CuriosityDesk](CuriosityDesk.jsx), [interview practice](interview_arena.jsx), and [nutrition/recipe UI](nutrition-recipe-app.jsx). **Components** requiring a host and API integration; inspect their imports for dependencies. |
| Support and video interfaces | [Support widget](customer_support_chatbot_widget.html); [proxied widget](support-chatbot-widget-proxied.html) expecting `localhost:3000/api/chat`; [movie generator](movie_gen.html) expecting `/api/*`. **UI/partial integrations**; required backends are absent from the root. |
| Audio and voice | [Signal audio tools](signal-audio-agent.html) and [voice wellness journal](voice_wellness_agent.html). **Browser demos** combining local audio processing/heuristics with model-backed features. |
| Packaged Python projects | [CodeForge](Codeforge.zip): coding-agent CLI, nested entry `codeforge/codeforge/cli.py`. [Lookout](lookout.zip): camera-frame vision demo, nested entry `lookout/backend/main.py`. **Archives** with nested ZIPs, source, and their own setup notes; model credentials required. |
| Other browser demos | [CancelKit](cancelkit.html), [Crux](crux.html), [job-board scanner](job-scan-agent.html), [Montessori activities](montessori-toddler-app.html), [mortgage calculator](mortgage-calculator.html), [Python tester](python-tester.html), and [word ladder](word_ladder_chain_game.html). |
| Supporting material | [Enterprise-memory diagram](ai_native_enterprise_memory.svg), [vertical-agent diagram](vertical_ai_agents_boring_expert_work.svg), and the original [scope note](Helpful%20Note). **Diagrams/notes**, not application entry points. |

## Opening and running

- Links open GitHub source. Download HTML demos and open locally or serve over HTTP. Some expect host theme variables; CDN libraries need network access.
- JSX needs a React host; the root has no shared package manifest/build command. Several model calls lack authentication wiring and need an authenticated integration or proxy.
- For `minimal_rag.py`, install `numpy` and `sentence-transformers`; first run downloads the embedding model. Generation additionally needs `anthropic` and `ANTHROPIC_API_KEY`. The notes reference a root `requirements.txt` that is absent.
- Extract archives and follow their enclosed setup notes. CodeForge and Lookout also contain inner ZIPs. Archive builds and authenticated API paths were not exercised for this index.
