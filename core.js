(function (root) {
  'use strict';
  const TYPES = {
    single_select: {label:'Một đáp án', short:'Trắc nghiệm', symbol:'◉'},
    multi_select: {label:'Nhiều đáp án', short:'Nhiều lựa chọn', symbol:'☑'},
    matching: {label:'Nối cặp', short:'Nối cặp', symbol:'⇄'},
    ordering: {label:'Sắp xếp', short:'Sắp xếp', symbol:'↕'},
    numeric_input: {label:'Nhập số', short:'Nhập số', symbol:'#'},
    short_text: {label:'Tự luận ngắn', short:'Tự luận', symbol:'≡'},
  };
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  function shuffled(list, random=Math.random) {
    const copy=[...list];
    for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  }
  function parseNumber(input) {
    let value=String(input??'').trim().replace(/\u00a0/g,' ');
    const percent=value.endsWith('%');
    if(percent)value=value.slice(0,-1).trim();
    // Decimal comma and decimal point are both supported; grouping is intentionally not guessed.
    if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value))return null;
    const number=Number(value.replace(',','.'));
    return Number.isFinite(number)?{value:number,percent}:null;
  }
  function isComplete(q, response) {
    if(q.type==='single_select')return typeof response==='string'&&q.choices.some(c=>c.choice_id===response);
    if(q.type==='multi_select')return Array.isArray(response)&&response.length>0;
    if(q.type==='matching')return !!response&&q.left.every(item=>q.right.some(right=>right.id===response[item.id]));
    if(q.type==='ordering')return Array.isArray(response)&&response.length===q.choices.length&&new Set(response).size===q.choices.length&&response.every(id=>q.choices.some(c=>c.choice_id===id));
    if(q.type==='numeric_input')return parseNumber(response)!==null;
    return typeof response==='string'&&response.trim().length>0;
  }
  function grade(q,response) {
    if(q.type==='short_text')return {automatic:false,correct:null};
    if(!isComplete(q,response))return {automatic:true,correct:false,incomplete:true};
    let correct=false;
    if(q.type==='single_select')correct=response===q.answer[0];
    if(q.type==='multi_select')correct=response.length===q.answer.length&&q.answer.every(id=>response.includes(id));
    if(q.type==='matching')correct=q.left.every(item=>response[item.id]===q.answer[item.id]);
    if(q.type==='ordering')correct=q.answer.every((id,index)=>response[index]===id);
    if(q.type==='numeric_input'){
      const parsed=parseNumber(response);
      if(parsed.percent&&q.numberMode==='number')return {automatic:true,correct:false,reason:'Câu này cần một số theo đơn vị của đề, không phải phần trăm.'};
      let value=parsed.value;
      if(parsed.percent&&q.numberMode==='ratio')value/=100;
      correct=Math.abs(value-q.answer)<=Math.max(q.tolerance??1e-6,Math.abs(q.answer)*1e-9);
    }
    return {automatic:true,correct};
  }
  function filterQuestions(questions,filters,progress={}) {
    const search=normalize(filters.search).trim();
    return questions.filter(q=>{
      const p=progress[q.id]??{};
      if(filters.day&&q.day!==filters.day)return false;
      if(filters.type&&q.type!==filters.type)return false;
      if(filters.status==='unseen'&&p.seen)return false;
      if(filters.status==='correct'&&p.status!=='correct')return false;
      if(filters.status==='incorrect'&&p.status!=='incorrect')return false;
      if(filters.status==='bookmarked'&&!p.bookmarked)return false;
      return !search||normalize(`${q.number} ${q.id} ${q.topic} ${q.prompt} ${q.choices.map(c=>c.text).join(' ')}`).includes(search);
    });
  }
  function stats(questions,progress) {
    const result={total:questions.length,seen:0,correct:0,incorrect:0,bookmarked:0};
    for(const q of questions){const p=progress[q.id]??{};if(p.seen)result.seen++;if(p.status==='correct')result.correct++;if(p.status==='incorrect')result.incorrect++;if(p.bookmarked)result.bookmarked++;}
    return result;
  }
  function sanitizeProgress(value,questions) {
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const result={};
    for(const q of questions){
      const p=value[q.id];if(!p||typeof p!=='object'||Array.isArray(p))continue;
      const status=['correct','incorrect'].includes(p.status)?p.status:null;
      let response=p.response;
      if(q.type==='matching'){
        const clean={};for(const left of q.left)if(q.right.some(right=>right.id===response?.[left.id]))clean[left.id]=response[left.id];response=clean;
      }else if(['multi_select','ordering'].includes(q.type)){
        response=Array.isArray(response)?[...new Set(response.filter(id=>q.choices.some(c=>c.choice_id===id)))]:[];
      }else response=typeof response==='string'?response.slice(0,20000):'';
      result[q.id]={seen:p.seen===true,bookmarked:p.bookmarked===true,status,response,checked:p.checked===true&&status!==null,attempts:Math.min(100000,Math.max(0,Number(p.attempts)||0))};
    }
    return result;
  }
  const api={TYPES,normalize,shuffled,parseNumber,isComplete,grade,filterQuestions,stats,sanitizeProgress};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.QuizCore=api;
})(typeof window!=='undefined'?window:globalThis);
