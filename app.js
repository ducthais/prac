(function(){
  'use strict';
  const C=window.QuizCore, bank=window.QUESTION_BANK;
  if(!C||!bank||bank.total!==1679){document.getElementById('question-card').textContent='Chưa tải được dữ liệu. Hãy kiểm tra các tệp data.js, core.js đi cùng trang và tải lại.';return;}
  const questions=bank.questions, byId=new Map(questions.map(q=>[q.id,q]));
  const storageKey='vlearn-1679-progress-v1', pageSize=40;
  const $=id=>document.getElementById(id);
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
  let progress=C.sanitizeProgress(saved.progress,questions);
  const storedFilters=saved.filters||{};
  let filters={day:questions.some(q=>q.day===storedFilters.day)?storedFilters.day:'',type:C.TYPES[storedFilters.type]?storedFilters.type:'',status:['unseen','correct','incorrect','bookmarked'].includes(storedFilters.status)?storedFilters.status:'',search:typeof storedFilters.search==='string'?storedFilters.search.slice(0,300):''};
  let shuffleOn=saved.shuffleOn===true, shuffleSeed=Number(saved.shuffleSeed)||1;
  let visible=[],cursor=0,mapPage=0,toastTimer,saveTimer,storageFailed=false;
  const revealed=new Set();
  function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function button(text,cls,fn){const b=node('button',cls,text);b.type='button';if(fn)b.addEventListener('click',fn);return b;}
  function seededRandom(seed){let value=seed>>>0;return()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function persist(){clearTimeout(saveTimer);try{localStorage.setItem(storageKey,JSON.stringify({version:1,progress,filters,shuffleOn,shuffleSeed,currentId:visible[cursor]?.id}));}catch{if(!storageFailed){storageFailed=true;document.querySelector('.autosave').textContent='Chưa thể lưu trên trình duyệt';toast('Bộ nhớ trình duyệt chưa sẵn sàng. Bạn vẫn học được và có thể tải bản sao tiến độ.');}}}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
  window.addEventListener('pagehide',persist);
  function record(q){return progress[q.id]||(progress[q.id]={seen:false,bookmarked:false,status:null,response:'',checked:false,attempts:0});}
  function current(){return visible[cursor];}
  function syncFilterInputs(){
    $('search').value=filters.search;$('day-filter').value=filters.day;$('status-filter').value=filters.status;
    $('shuffle').setAttribute('aria-pressed',String(shuffleOn));
  }
  function renderTypes(){
    const container=$('type-filters');container.replaceChildren();
    const entries=[['',{label:'Tất cả câu hỏi',symbol:'▤'}],...Object.entries(C.TYPES)];
    for(const [key,type]of entries){
      const b=button('',`type-filter${filters.type===key?' active':''}`,()=>{filters.type=key;applyFilters();});
      b.setAttribute('aria-pressed',String(filters.type===key));
      b.append(node('span','type-symbol',type.symbol),node('span','',type.label),node('span','count',(key?bank.counts[key]:bank.total).toLocaleString('vi-VN')));
      container.append(b);
    }
  }
  function renderStats(){
    const s=C.stats(questions,progress);
    $('stat-seen').textContent=s.seen.toLocaleString('vi-VN');$('stat-correct').textContent=s.correct.toLocaleString('vi-VN');$('stat-review').textContent=s.incorrect.toLocaleString('vi-VN');
    const percentage=s.correct/questions.length*100;
    $('progress-label').textContent=percentage.toLocaleString('vi-VN',{maximumFractionDigits:1})+'%';$('progress-fill').style.width=percentage+'%';
    document.querySelector('.progress-track').setAttribute('aria-valuenow',s.correct);
  }
  function applyFilters(preferId){
    visible=C.filterQuestions(questions,filters,progress);
    if(shuffleOn)visible=C.shuffled(visible,seededRandom(shuffleSeed));
    const index=preferId?visible.findIndex(q=>q.id===preferId):-1;
    cursor=index>=0?index:0;mapPage=Math.floor(cursor/pageSize);
    syncFilterInputs();renderTypes();renderResult();renderQuestion();persist();
  }
  function renderResult(){
    const statusLabels={unseen:'Chưa xem',correct:'Đã nắm vững',incorrect:'Cần ôn lại',bookmarked:'Đã đánh dấu'};
    const label=[filters.type?C.TYPES[filters.type].label:'Tất cả câu hỏi',filters.day,statusLabels[filters.status]].filter(Boolean).join(' · ');
    $('result-label').textContent=label;$('result-count').textContent=visible.length.toLocaleString('vi-VN')+' câu';
    $('clear-filters').hidden=!Object.values(filters).some(Boolean);
    $('previous').disabled=cursor<=0||!visible.length;$('next').disabled=cursor>=visible.length-1||!visible.length;
    $('position-label').textContent=visible.length?`${cursor+1} / ${visible.length.toLocaleString('vi-VN')}`:'0 câu';
    renderMap();
  }
  function renderMap(){
    const map=$('question-map');map.replaceChildren();
    const pages=Math.max(1,Math.ceil(visible.length/pageSize));mapPage=Math.max(0,Math.min(mapPage,pages-1));
    for(let i=mapPage*pageSize;i<Math.min((mapPage+1)*pageSize,visible.length);i++){
      const q=visible[i],p=progress[q.id]||{};
      const b=button(String(q.number),`map-item ${p.status||''}${i===cursor?' current':''}${p.bookmarked?' bookmarked':''}`,()=>goTo(i));
      b.title=`Câu ${q.number} · ${q.id} · ${C.TYPES[q.type].label}`;b.setAttribute('aria-label',b.title+(p.status==='correct'?', đã nắm vững':p.status==='incorrect'?', cần ôn lại':''));
      if(i===cursor)b.setAttribute('aria-current','true');map.append(b);
    }
    $('map-page').textContent=`Trang ${mapPage+1} / ${pages}`;$('map-prev').disabled=mapPage===0;$('map-next').disabled=mapPage>=pages-1;
  }
  function appendRich(parent,text){
    // Content from the CSV is data: never insert it as HTML or execute code blocks.
    const parts=String(text).split(/(```[\s\S]*?```)/g);
    for(const part of parts){
      if(part.startsWith('```')){const code=part.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');parent.append(node('pre','prompt-code',code));}
      else for(const chunk of part.split(/(`[^`\n]+`)/g))parent.append(chunk.startsWith('`')&&chunk.endsWith('`')?node('code','',chunk.slice(1,-1)):document.createTextNode(chunk));
    }
  }
  function setResponse(q,value){const p=record(q);p.response=value;p.checked=false;revealed.delete(q.id);scheduleSave();const check=$('check-answer');if(check)check.disabled=!C.isComplete(q,value);}
  function initialOrder(q){
    const ids=q.choices.map(c=>c.choice_id);let order=C.shuffled(ids);
    if(order.every((id,i)=>id===q.answer[i])&&order.length>1)order=[...order.slice(1),order[0]];
    return order;
  }
  function renderResponse(q,p){
    const section=node('section','response-section');section.setAttribute('aria-label','Câu trả lời của bạn');
    const labels={single_select:'CHỌN MỘT ĐÁP ÁN',multi_select:'CHỌN TẤT CẢ ĐÁP ÁN ĐÚNG',matching:'GHÉP TỪNG Ý VỚI MỤC PHÙ HỢP',ordering:'DÙNG MŨI TÊN ĐỂ SẮP XẾP THỨ TỰ',numeric_input:'NHẬP KẾT QUẢ CỦA BẠN',short_text:'THỬ VIẾT CÂU TRẢ LỜI CỦA BẠN'};
    section.append(node('div','response-label',labels[q.type]));
    if(['single_select','multi_select'].includes(q.type)){
      const choices=node('div','choices');
      for(const c of q.choices){
        const label=node('label','choice');label.dataset.choice=c.choice_id;
        const input=node('input');input.type=q.type==='single_select'?'radio':'checkbox';input.name='question-response';input.value=c.choice_id;
        input.checked=q.type==='single_select'?p.response===c.choice_id:Array.isArray(p.response)&&p.response.includes(c.choice_id);
        input.addEventListener('change',()=>{
          const selected=[...choices.querySelectorAll('input:checked')].map(el=>el.value);
          setResponse(q,q.type==='single_select'?selected[0]:selected);
          $('answer-feedback')?.remove();choices.querySelectorAll('.choice').forEach(n=>n.classList.remove('correct-choice','wrong-choice'));
        });
        const text=node('span','choice-text');appendRich(text,c.text);
        label.append(input,node('span','choice-id',c.choice_id),text);choices.append(label);
      }
      section.append(choices);
    }else if(q.type==='matching'){
      if(!p.response||typeof p.response!=='object'||Array.isArray(p.response))p.response={};
      const list=node('div','match-list');
      for(const item of q.left){
        const row=node('div','match-row');row.dataset.left=item.id;
        const text=node('label','match-text');text.htmlFor='match-'+item.id;appendRich(text,item.text);
        const select=node('select');select.id='match-'+item.id;select.setAttribute('aria-label','Ghép: '+item.text);
        const blank=node('option','','Chọn mục phù hợp…');blank.value='';select.append(blank);
        for(const right of q.right){const option=node('option','',`[${right.id}] ${right.text}`);option.value=right.id;select.append(option);}
        select.value=p.response[item.id]||'';
        select.addEventListener('change',()=>{setResponse(q,{...p.response,[item.id]:select.value});$('answer-feedback')?.remove();row.classList.remove('match-correct','match-wrong');});
        row.append(text,node('span','match-arrow','→'),select);list.append(row);
      }
      section.append(list,node('p','input-help','Một mục bên phải có thể được dùng nhiều lần nếu phù hợp câu hỏi.'));
    }else if(q.type==='ordering'){
      if(!C.isComplete(q,p.response))p.response=initialOrder(q);
      const list=node('div','ordering-list');
      p.response.forEach((id,index)=>{
        const item=q.choices.find(c=>c.choice_id===id),row=node('div','order-row');row.dataset.item=id;
        const text=node('div','order-content');appendRich(text,item.text);
        const controls=node('div','order-controls');
        for(const [offset,symbol,action] of [[-1,'↑','Lên'],[1,'↓','Xuống']]){
          const move=button(symbol,'',()=>{const order=[...p.response];[order[index],order[index+offset]]=[order[index+offset],order[index]];setResponse(q,order);renderQuestion();document.querySelector(`[data-item="${id}"] .order-controls button${offset<0?':first-child':':last-child'}`)?.focus();});
          move.disabled=(index+offset<0||index+offset>=p.response.length);move.setAttribute('aria-label',`${action}: ${item.text}`);controls.append(move);
        }
        row.append(node('span','order-position',index+1),text,controls);list.append(row);
      });section.append(list);
    }else if(q.type==='numeric_input'){
      const input=node('input','input-number');input.type='text';input.inputMode='decimal';input.id='numeric-response';input.autocomplete='off';input.setAttribute('aria-label','Kết quả số của bạn');input.placeholder=q.numberMode==='percent'?'Ví dụ: 25,5 hoặc 25,5%':q.numberMode==='ratio'?'Ví dụ: 0,75 hoặc 75%':'Nhập số, dùng dấu phẩy hoặc dấu chấm';input.value=p.response??'';
      input.addEventListener('input',()=>{setResponse(q,input.value);$('answer-feedback')?.remove();});
      input.addEventListener('keydown',event=>{if(event.key==='Enter'&&C.isComplete(q,input.value))checkAnswer(q);});
      section.append(input,node('p','input-help',q.numberMode==='percent'?'Đơn vị phần trăm (%), theo yêu cầu của đề.':q.numberMode==='ratio'?'Nhập tỷ lệ 0–1, hoặc thêm dấu % nếu dùng phần trăm.':'Theo đơn vị trong đề. Không dùng dấu phân cách hàng nghìn.'));
    }else{
      const input=node('textarea');input.id='text-response';input.setAttribute('aria-label','Câu trả lời tự luận của bạn');input.placeholder='Ghi các ý chính hoặc giải thích bằng lời của bạn…';input.value=p.response||'';
      input.addEventListener('input',()=>{p.response=input.value;scheduleSave();});
      section.append(input,node('p','input-help','Tự luận được tự đánh giá sau khi đối chiếu bài mẫu; trang không tự chấm đúng/sai bằng từ khóa.'));
    }
    return section;
  }
  function renderQuestion(){
    const card=$('question-card');card.replaceChildren();const q=current();
    if(!q){const empty=node('div','empty-state');empty.append(node('div','empty-symbol','⌕'),node('h3','','Chưa có câu phù hợp'),node('p','','Thử đổi bài học, dạng câu, tiến độ hoặc từ khóa.'),button('Xóa bộ lọc','button primary',clearFilters));card.append(empty);renderStats();renderResult();return;}
    const p=record(q);p.seen=true;
    const meta=node('div','question-meta');const difficulty={easy:'Cơ bản',medium:'Vận dụng',hard:'Nâng cao'};
    meta.append(node('span','question-number',`Câu ${q.number}`),node('span','',q.day),node('span','','· '+C.TYPES[q.type].label),node('span','code-id','· '+q.id));
    if(q.note)meta.append(node('span','','· Có lưu ý'));
    const bookmark=button(p.bookmarked?'★':'☆','bookmark',()=>{p.bookmarked=!p.bookmarked;bookmark.textContent=p.bookmarked?'★':'☆';bookmark.setAttribute('aria-pressed',String(p.bookmarked));bookmark.setAttribute('aria-label',p.bookmarked?'Bỏ đánh dấu câu này':'Đánh dấu câu này');persist();renderMap();});
    bookmark.setAttribute('aria-pressed',String(p.bookmarked));bookmark.setAttribute('aria-label',p.bookmarked?'Bỏ đánh dấu câu này':'Đánh dấu câu này');meta.append(bookmark);
    card.append(meta,node('h2','question-topic',q.topic));
    const prompt=node('div','question-prompt');appendRich(prompt,q.prompt);card.append(prompt,renderResponse(q,p));
    if(q.hints?.length){const details=node('details','hint');details.append(node('summary','','✦ Gợi ý để tự suy nghĩ'),node('div','hint-content',q.hints.join('\n\n')));card.append(details);}
    const actions=node('div','question-actions');
    if(q.type!=='short_text'){
      const check=button('Kiểm tra đáp án','button primary',()=>checkAnswer(q));check.id='check-answer';check.disabled=!C.isComplete(q,p.response);actions.append(check);
    }
    const show=button(q.type==='short_text'?'Đối chiếu bài mẫu':'Xem đáp án',q.type==='short_text'?'button primary':'button subtle',()=>{revealed.add(q.id);showFeedback(q);});show.id='reveal-answer';actions.append(show);
    actions.append(button('Làm lại','text-button',()=>{p.response=q.type==='ordering'?initialOrder(q):q.type==='matching'?{}:q.type==='multi_select'?[]:'';p.status=null;p.checked=false;revealed.delete(q.id);renderQuestion();persist();}));
    card.append(actions);
    if(p.checked||revealed.has(q.id))showFeedback(q);
    renderStats();renderResult();scheduleSave();
  }
  function checkAnswer(q){
    const p=record(q),result=C.grade(q,p.response);if(result.incomplete){toast('Hãy hoàn thành câu trả lời trước khi kiểm tra.');return;}
    p.checked=true;p.status=result.correct?'correct':'incorrect';p.attempts=(p.attempts||0)+1;revealed.add(q.id);showFeedback(q,result);renderStats();renderMap();persist();
  }
  function showFeedback(q,result){
    $('answer-feedback')?.remove();const p=record(q);
    const graded=p.checked&&q.type!=='short_text';result=result||(graded?C.grade(q,p.response):null);
    const block=node('section','answer-block'+(graded&&!result.correct?' incorrect':''));block.id='answer-feedback';block.setAttribute('aria-live','polite');
    const title=q.type==='short_text'?'Bài trả lời mẫu để đối chiếu':graded?(result.correct?'✓ Chính xác. Bạn đã nắm được ý này!':'Chưa đúng. Cùng xem lại đáp án nhé.'): 'Đáp án tham khảo';
    block.append(node('h3','feedback-title',title));
    if(result?.reason)block.append(node('p','input-help',result.reason));
    const text=node('div','answer-text');appendRich(text,q.answerText);block.append(text);
    if(q.note)block.append(node('div','answer-warning','Lưu ý khi đối chiếu\n'+q.note));
    if(q.sources){const details=node('details','answer-sources');details.append(node('summary','','Tài liệu đối chiếu'));for(const url of q.sources.split(/\s*;\s*/)){if(!/^https:\/\//.test(url))continue;const a=node('a','',new URL(url).hostname+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}block.append(details);}
    if(q.type==='short_text'){
      block.append(node('p','self-review-note','So các ý chính, điều kiện và phép tính. Cách diễn đạt của bạn không cần giống nguyên văn bài mẫu.'));
      const review=node('div','self-review');
      for(const [status,label]of [['correct','✓ Tôi đã nắm vững'],['incorrect','↻ Tôi cần ôn lại']]){const b=button(label,`button ${p.status===status?'primary':'subtle'}`,()=>{p.status=status;p.checked=true;p.attempts=(p.attempts||0)+1;renderStats();renderMap();persist();showFeedback(q);});b.setAttribute('aria-pressed',String(p.status===status));review.append(b);}block.append(review);
    }else if(graded){
      document.querySelectorAll('.choice').forEach(label=>{label.classList.toggle('correct-choice',q.answer.includes(label.dataset.choice));const selected=label.querySelector('input')?.checked;label.classList.toggle('wrong-choice',selected&&!q.answer.includes(label.dataset.choice));});
      if(q.type==='matching')document.querySelectorAll('.match-row').forEach(row=>row.classList.add(p.response[row.dataset.left]===q.answer[row.dataset.left]?'match-correct':'match-wrong'));
    }
    $('question-card').append(block);
    $('reveal-answer').textContent=q.type==='short_text'?'Đã mở bài mẫu':'Đã mở đáp án';
  }
  function goTo(index){if(index<0||index>=visible.length)return;cursor=index;mapPage=Math.floor(cursor/pageSize);renderQuestion();persist();}
  function clearFilters(){filters={day:'',type:'',status:'',search:''};applyFilters();}
  for(const day of [...new Set(questions.map(q=>q.day))]){const count=questions.filter(q=>q.day===day).length;const option=node('option','',`${day} · ${count} câu`);option.value=day;$('day-filter').append(option);}
  $('day-filter').addEventListener('change',event=>{filters.day=event.target.value;applyFilters();});
  $('status-filter').addEventListener('change',event=>{filters.status=event.target.value;applyFilters();});
  let searchTimer;$('search').addEventListener('input',event=>{clearTimeout(searchTimer);const value=event.target.value;searchTimer=setTimeout(()=>{filters.search=value;applyFilters();},170);});
  $('clear-filters').addEventListener('click',clearFilters);
  $('shuffle').addEventListener('click',()=>{shuffleOn=!shuffleOn;if(shuffleOn)shuffleSeed=Date.now()>>>0;applyFilters(current()?.id);toast(shuffleOn?'Đã trộn thứ tự câu hỏi trong bộ lọc.':'Đã trở về thứ tự trong bộ gốc.');});
  $('previous').addEventListener('click',()=>goTo(cursor-1));$('next').addEventListener('click',()=>goTo(cursor+1));
  $('map-prev').addEventListener('click',()=>{mapPage--;renderMap();});$('map-next').addEventListener('click',()=>{mapPage++;renderMap();});
  $('jump-form').addEventListener('submit',event=>{event.preventDefault();const number=Number($('jump-number').value);if(!Number.isInteger(number)||number<1||number>1679){toast('Nhập số câu từ 1 đến 1.679.');return;}const q=questions[number-1];let index=visible.findIndex(item=>item.id===q.id);if(index<0){filters={day:'',type:'',status:'',search:''};applyFilters(q.id);toast('Đã mở câu trong toàn bộ thư viện.');}else goTo(index);});
  $('open-settings').addEventListener('click',()=>$('settings-dialog').showModal());$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
  $('export-progress').addEventListener('click',()=>{const payload={app:'vlearn-1679',version:1,exportedAt:new Date().toISOString(),progress};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download='tien-do-on-tap-1679.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Đã tải bản sao tiến độ.');});
  $('import-progress').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8e6)throw Error();const data=JSON.parse(await file.text());if(data.app!=='vlearn-1679'||data.version!==1||!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw Error();const incoming=C.sanitizeProgress(data.progress,questions);if(!Object.keys(incoming).length)throw Error();progress={...progress,...incoming};revealed.clear();applyFilters(current()?.id);toast('Đã khôi phục tiến độ từ bản sao.');}catch{toast('Không đọc được bản sao. Hãy chọn tệp JSON tiến độ do trang này tạo.');}finally{event.target.value='';}});
  $('reset-progress').addEventListener('click',()=>{if(!window.confirm('Xóa toàn bộ câu trả lời, đánh dấu và tiến độ trên trình duyệt này? Hãy sao lưu trước nếu cần.'))return;progress={};revealed.clear();filters.status='';applyFilters();$('settings-dialog').close();toast('Đã xóa tiến độ. Bắt đầu một lượt học mới nhé.');});
  applyFilters(typeof saved.currentId==='string'?saved.currentId:null);
})();
