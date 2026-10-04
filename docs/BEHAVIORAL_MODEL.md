# Behavioral Model

SIcologist treats an agent as an observed system. Rung 1 observations are normalized metrics in `[0,1]`.

| Metric | Meaning |
|---|---|
| repetitionRate | repeated output/action structure |
| progressRate | measurable task progress |
| goalAlignment | agreement with active goal |
| confidence | stated/estimated confidence |
| evidenceStrength | external support quality |
| contextLoad | context saturation |
| roleBleedRate | leakage across roles |
| memoryContamination | untrusted memory influence |
| toolRetryRate | repeated unsuccessful tool attempts |
| consensusDiversity | diversity of independent conclusions |
| challengerAcceptance | responsiveness to counterevidence |
| confabulationRisk | unsupported-detail risk |
| authorityPressure | pressure to exceed granted authority |
| recoveryDelta | improvement after intervention |

Derived metric:

```text
confidenceEvidenceGap = max(0, confidence - evidenceStrength)
```

Baselines are optional. Rung 1 reports deltas but does not silently redefine declared thresholds.
