const metrics=['score','lcp','blocking','cls','bytes'];
export function summarizeTrials(trials){
 if(trials.length!==3||trials.some(trial=>metrics.some(metric=>!Number.isFinite(trial[metric]))))throw Error('Three complete numeric Lighthouse trials are required');
 const samples=[...trials].sort((a,b)=>a.lcp-b.lcp);
 return {...samples[1],...Object.fromEntries(metrics.map(metric=>[metric,trials.map(trial=>trial[metric]).sort((a,b)=>a-b)[1]])),samples};
}
