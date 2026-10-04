import {
  CaseBook,
  assessObservation,
  compareRecovery
} from "../src/index.js";

const book=new CaseBook();

function runEpisode(label,beforeMetrics,afterMetrics){
  const file=book.openCase({
    agentId:"builder-07",
    title:label,
    context:{role:"builder",taskClass:"browser-repair"}
  });

  const before=assessObservation(beforeMetrics);
  file.recordAssessment(before);

  const interventionId=file.applyIntervention({
    action:"inject_novelty_probe",
    targetCondition:"SC-001",
    authorization:"AUTO_ALLOWED"
  });

  const after=assessObservation(afterMetrics);
  const recovery=compareRecovery(before,after,"SC-001");
  file.recordAssessment(after);
  file.recordRecovery({interventionId,...recovery});
  file.close(recovery.outcome);

  return file.snapshot();
}

runEpisode(
  "loop episode 1",
  {repetitionRate:.9,progressRate:.1},
  {repetitionRate:.2,progressRate:.8}
);

runEpisode(
  "loop episode 2",
  {repetitionRate:.8,progressRate:.2},
  {repetitionRate:.3,progressRate:.7}
);

console.log(JSON.stringify({
  recurrence:book.recurrence("builder-07","SC-001"),
  history:book.interventionHistory({agentId:"builder-07",conditionId:"SC-001"}),
  recommendation:book.recommend({agentId:"builder-07",conditionId:"SC-001"})
},null,2));
