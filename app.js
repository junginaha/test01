(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const screens = {
    home: $('#screen-home'),
    reading: $('#screen-reading'),
    preview: $('#screen-preview'),
    approved: $('#screen-approved'),
  };

  const state = {
    pages: [],
    index: 0,
    title: '미리보기',
    adjustment: null,
    analysis: null,
  };

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('active', key === name));
    $('#topStatus').textContent = ({ home:'READY', reading:'READING', preview:'PREVIEW', approved:'SAVED' })[name] || 'READY';
    window.scrollTo({ top:0, behavior:'instant' });
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  function clean(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitParagraphs(text) {
    let parts = clean(text).split(/\n+/).map(x => x.trim()).filter(x => x.length > 3);
    if (parts.length < 12) {
      const sentenceParts = clean(text).split(/(?<=[.!?。！？])\s+/).map(x => x.trim()).filter(x => x.length > 8);
      if (sentenceParts.length > parts.length) parts = sentenceParts;
    }
    return parts;
  }

  function classify(p) {
    const s = p.trim();
    if (s.length <= 34 && !/[.!?。！？]$/.test(s)) return 'heading';
    if (/(첫째|둘째|셋째|넷째|하세요|해보세요|바랍니다|실천|체크|단계|방법)/.test(s)) return 'action';
    if (/(\d{2,4}년|\d+[,.]?\d*%|\d+[,.]?\d*(원|달러|명|건|개)|조사|연구|통계|사례|데이터|보고서)/.test(s)) return 'evidence';
    if (/[?？]/.test(s)) return 'question';
    if (s.length <= 90) return 'key';
    return 'body';
  }

  function analyze(text, filename) {
    const paras = splitParagraphs(text);
    const roles = paras.map(p => ({ text:p, role:classify(p), len:p.length }));
    const byRole = (r) => roles.filter(x => x.role === r).map(x => x.text);
    const avg = roles.length ? roles.reduce((a,b) => a + b.len, 0) / roles.length : 0;
    const ratio = (r) => roles.length ? roles.filter(x => x.role === r).length / roles.length : 0;

    let archetype = 'warm-practical';
    if (ratio('evidence') > .13) archetype = 'structured-evidence';
    else if (ratio('action') > .10) archetype = 'warm-practical';
    else if (avg > 180) archetype = 'quiet-longform';
    else if (ratio('key') + ratio('question') > .33) archetype = 'editorial-shortform';

    let title = byRole('heading')[0] || filename.replace(/\.[^.]+$/, '') || '새 책';
    title = title.replace(/^\s*\d+[.)]\s*/, '').slice(0, 42);

    return {
      paras, roles, title, archetype,
      headings:byRole('heading'),
      bodies:byRole('body'),
      keys:[...byRole('question'), ...byRole('key')],
      evidence:byRole('evidence'),
      actions:byRole('action'),
    };
  }

  function shorten(s, max = 130) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    return cut.replace(/\s+\S*$/, '') + '…';
  }

  function pick(arr, index, fallback = '') {
    return (arr && arr[index]) || fallback;
  }

  function generatePages(a) {
    const b = a.bodies.length ? a.bodies : a.paras;
    const k = a.keys.length ? a.keys : a.paras.filter(x => x.length < 120);
    const e = a.evidence.length ? a.evidence : b.slice(4, 8);
    const ac = a.actions.length ? a.actions : b.slice(7, 10);
    const h = a.headings;

    const chapterTitle = pick(h, 1, a.title);
    const statement = shorten(pick(k, 0, pick(b, 0, '이 책의 첫 문장을 시작합니다.')), 110);

    return [
      { type:'opener', label:'CHAPTER', title:chapterTitle, intro:statement },
      { type:'body', label:'READ', lead:shorten(pick(k,1,pick(b,0,'')),92), paras:[pick(b,0),pick(b,1),pick(b,2)].filter(Boolean) },
      { type:'key', label:'PAUSE', quote:shorten(pick(k,2,pick(b,2,'한 문장을 오래 남깁니다.')),145), note:shorten(pick(b,3,''),100) },
      { type:'split', label:'POINT OF VIEW', statement:shorten(pick(k,3,pick(b,4,'')),120), sub:shorten(pick(b,5,pick(b,1,'')),150) },
      { type:'evidence', label:'EVIDENCE', title:pick(h,2,'근거와 사례'), items:e.slice(0,3) },
      { type:'dark', label:'SECTION', title:pick(h,3,shorten(pick(k,4,'다음 장면으로 넘어갑니다.'),70)), intro:shorten(pick(b,6,''),120) },
      { type:'body', label:'READ', lead:shorten(pick(k,5,pick(b,7,'')),92), paras:[pick(b,7),pick(b,8),pick(b,9)].filter(Boolean) },
      { type:'action', label:'ACTION', title:pick(h,4,'지금 시작할 수 있는 것'), items:ac.slice(0,3) },
      { type:'key', label:'KEY MESSAGE', quote:shorten(pick(k,6,pick(b,10,'')),145), note:shorten(pick(b,11,''),100) },
      { type:'pause', label:'NEXT', statement:shorten(pick(k,7,pick(a.paras,a.paras.length-1,'다음 페이지에서 이어집니다.')),120) },
    ];
  }

  function esc(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  }

  function renderPage(p, n) {
    const folio = `<div class="folio">${String(n).padStart(2,'0')}</div>`;
    const wm = `<div class="watermark">ONE DAY BOOKS</div>`;
    const label = `<div class="page-label">${esc(p.label)}</div>`;

    if (p.type === 'opener') return `<article class="book-page opener">${wm}${label}<div class="chapter-no">${String(n).padStart(2,'0')}</div><h3>${esc(p.title)}</h3><div class="accent-line"></div><div class="intro">${esc(p.intro)}</div>${folio}</article>`;
    if (p.type === 'body') return `<article class="book-page body">${wm}${label}<div class="lead">${esc(p.lead)}</div><div class="accent-line"></div>${(p.paras||[]).map(x => `<p>${esc(shorten(x,250))}</p>`).join('')}${folio}</article>`;
    if (p.type === 'key') return `<article class="book-page key">${wm}${label}<blockquote>${esc(p.quote)}</blockquote><div class="note">${esc(p.note)}</div>${folio}</article>`;
    if (p.type === 'split') return `<article class="book-page split">${wm}<div>${label}<div class="statement">${esc(p.statement)}</div></div><div class="sub">${esc(p.sub)}</div>${folio}</article>`;
    if (p.type === 'evidence' || p.type === 'action') {
      const typeLabel = p.type === 'action' ? 'STEP' : 'CASE';
      return `<article class="book-page ${p.type}">${wm}${label}<h3>${esc(p.title)}</h3>${(p.items||[]).map((x,i)=>`<div class="list-item"><div class="list-no">${String(i+1).padStart(2,'0')}</div><div class="list-copy"><strong>${typeLabel}</strong><span>${esc(shorten(x,132))}</span></div></div>`).join('')}${folio}</article>`;
    }
    if (p.type === 'dark') return `<article class="book-page opener dark">${wm}${label}<div class="chapter-no">${String(n).padStart(2,'0')}</div><h3>${esc(p.title)}</h3><div class="accent-line"></div><div class="intro">${esc(p.intro)}</div>${folio}</article>`;
    return `<article class="book-page pause">${wm}${label}<div class="statement">${esc(p.statement)}</div><div class="sign">ONE DAY BOOKS OS</div>${folio}</article>`;
  }

  function renderPreview() {
    const desktop = window.innerWidth > 720;
    const step = desktop ? 2 : 1;
    if (desktop && state.index % 2 === 1) state.index -= 1;
    state.index = Math.max(0, Math.min(state.index, state.pages.length - 1));

    const first = state.pages[state.index];
    let html = renderPage(first, state.index + 1);
    if (desktop && state.index + 1 < state.pages.length) html += renderPage(state.pages[state.index + 1], state.index + 2);
    $('#bookStage').innerHTML = html;
    $('#pageCount').textContent = `${String(state.index + 1).padStart(2,'0')} / ${String(state.pages.length).padStart(2,'0')}`;
    $('#prevPage').disabled = state.index === 0;
    $('#nextPage').disabled = state.index >= state.pages.length - step;
  }

  async function extractFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.md')) return await file.text();
    const buffer = await file.arrayBuffer();

    if (name.endsWith('.docx')) {
      if (!window.mammoth) throw new Error('DOCX parser unavailable');
      const result = await window.mammoth.extractRawText({ arrayBuffer:buffer });
      return result.value;
    }

    if (name.endsWith('.hwpx')) {
      if (!window.JSZip) throw new Error('HWPX parser unavailable');
      const zip = await window.JSZip.loadAsync(buffer);
      const names = Object.keys(zip.files).filter(n => /Contents\/section\d+\.xml/i.test(n)).sort();
      const out = [];
      for (const n of names) {
        const xml = await zip.file(n).async('text');
        const doc = new DOMParser().parseFromString(xml,'text/xml');
        const paragraphs = Array.from(doc.getElementsByTagNameNS('*','p'));
        paragraphs.forEach(p => {
          const t = Array.from(p.getElementsByTagNameNS('*','t')).map(x=>x.textContent).join('');
          if (t.trim()) out.push(t.trim());
        });
      }
      return out.join('\n');
    }

    if (name.endsWith('.pdf')) {
      if (!window.pdfjsLib) throw new Error('PDF parser unavailable');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await window.pdfjsLib.getDocument({ data:new Uint8Array(buffer) }).promise;
      const out = [];
      for (let i=1; i<=Math.min(pdf.numPages,160); i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        out.push(tc.items.map(it => it.str).join(' '));
      }
      return out.join('\n');
    }

    throw new Error('지원하지 않는 파일 형식');
  }

  async function runWithText(text, filename='원고') {
    show('reading');
    await new Promise(r => setTimeout(r, 550));
    const a = analyze(text, filename);
    if (a.paras.length < 3) throw new Error('원고 내용이 너무 짧습니다.');
    state.analysis = a;
    state.pages = generatePages(a);
    state.index = 0;
    state.title = a.title;
    $('#bookTitle').textContent = a.title;
    show('preview');
    renderPreview();
  }

  async function runFile(file) {
    try {
      show('reading');
      const text = await extractFile(file);
      await runWithText(text, file.name);
    } catch (err) {
      console.error(err);
      show('home');
      toast('원고를 읽지 못했습니다.');
    }
  }

  const sample = `돈의 면접
운과 부를 끌어당기는 에너지
돈이 주는 가장 큰 선물은 시간적 자유입니다
돈이 전부가 아니라는 말, 맞습니다. 하지만 돈이 아무것도 아니라는 말, 그것은 거짓입니다.
대부분의 사람들은 시간을 팔아 돈을 법니다. 아침 9시에 출근해야 하고, 저녁 6시에 퇴근합니다. 휴가는 눈치를 보며 상사에게 보고하고 써야 합니다. 온전히 시간이 내 것이 아닙니다.
돈이 있으면 시간을 살 수 있습니다. 월요일 오전 10시에 카페에 앉아 책을 읽을 수 있고, 사랑하는 사람에게 필요한 순간 달려갈 수 있습니다.
질문 하나가 있습니다. 지금 당신은 어떤 삶을 선택하고 있나요?
2005년 스탠퍼드대학교 졸업식 연설에서 스티브 잡스는 연결되지 않던 점들이 시간이 지나며 이어진다고 말했습니다.
첫째, 돈을 피하지 마세요. 둘째, 작은 숫자부터 기록하세요. 셋째, 반복해서 확인하세요.
여행이 이벤트가 아니라 삶의 일부가 될 때 선택의 기준은 달라집니다.
내가 원하는 공간에서 살 수 있습니다
공간이 바뀌면 생각이 바뀌고, 생각이 바뀌면 삶이 바뀝니다.
하기 싫은 일을 안 할 수 있는 용기는 선택권에서 시작됩니다.
돈은 목적이 아니라 더 나은 삶을 위한 수단입니다.
실패는 끝이 아니라 아직 충분히 배우지 못했다는 신호일 뿐입니다.`;

  $('#chooseFile').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { const f=e.target.files?.[0]; if(f) runFile(f); });
  $('#runDemo').addEventListener('click', () => runWithText(sample,'돈의 면접'));
  $('#homeBtn').addEventListener('click', () => show('home'));
  $('#restartBtn').addEventListener('click', () => show('home'));
  $('#newManuscriptBtn').addEventListener('click', () => show('home'));

  const dropZone = $('#dropZone');
  ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.remove('drag'); }));
  dropZone.addEventListener('drop', e => { const f=e.dataTransfer.files?.[0]; if(f) runFile(f); });

  $('#prevPage').addEventListener('click', () => { state.index -= window.innerWidth > 720 ? 2 : 1; renderPreview(); });
  $('#nextPage').addEventListener('click', () => { state.index += window.innerWidth > 720 ? 2 : 1; renderPreview(); });
  window.addEventListener('resize', renderPreview);

  let touchX = null;
  $('#previewShell').addEventListener('touchstart', e => touchX = e.changedTouches[0].clientX, {passive:true});
  $('#previewShell').addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 55) {
      state.index += dx < 0 ? 1 : -1;
      renderPreview();
    }
    touchX = null;
  }, {passive:true});

  $('#adjustBtn').addEventListener('click', () => { $('#sheetBackdrop').classList.add('open'); $('#sheetBackdrop').setAttribute('aria-hidden','false'); });
  $('#sheetBackdrop').addEventListener('click', e => { if(e.target === $('#sheetBackdrop')) closeSheet(); });
  function closeSheet(){ $('#sheetBackdrop').classList.remove('open'); $('#sheetBackdrop').setAttribute('aria-hidden','true'); }

  $$('.adjust-option').forEach(btn => btn.addEventListener('click', () => {
    $$('.adjust-option').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    state.adjustment = btn.dataset.adjust;
  }));

  $('#applyAdjust').addEventListener('click', () => {
    document.body.classList.remove('adjust-quiet','adjust-crisp','adjust-large','adjust-airy');
    if (state.adjustment) document.body.classList.add(`adjust-${state.adjustment}`);
    closeSheet();
    renderPreview();
    toast('수정했습니다.');
  });

  $('#approveBtn').addEventListener('click', () => show('approved'));
})();