export function summarize(state, through = '9', includeBonus = false) {
  const cutoff = state.rounds.find(round => round.id === String(through))?.sort_order ?? 8;
  const rounds = state.rounds.filter(round => round.id === 'bonus' ? includeBonus : round.sort_order <= cutoff);
  const selected = new Set(rounds.map(round => round.id));
  const questions = state.questions.filter(question => selected.has(question.round_id));
  const entries = state.teams.filter(team => team.active).map(team => {
    const scores = Object.fromEntries(rounds.map(round => [round.id, {points:0,reviewed:0,total:questions.filter(question => question.round_id === round.id).length}]));
    for (const answer of state.answers) {
      if (answer.team_id !== team.id || !selected.has(answer.round_id) || answer.points_cents === null) continue;
      scores[answer.round_id].points += answer.points_cents;
      scores[answer.round_id].reviewed++;
    }
    return {id:team.id,name:team.name,scores,total:Object.values(scores).reduce((sum,score)=>sum+score.points,0),reviewed:Object.values(scores).reduce((sum,score)=>sum+score.reviewed,0),questionCount:questions.length};
  }).sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'nl'));
  entries.forEach((entry,index)=>{entry.rank=index && entries[index-1].total===entry.total ? entries[index-1].rank : index+1;});
  return {rounds,entries,provisional:rounds.some(round=>!round.closed) || entries.some(entry=>entry.reviewed<entry.questionCount)};
}
export const formatPoints = cents => new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(cents/100);
