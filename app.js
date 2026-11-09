const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Rev', 'Pastor', 'Chief', 'Other'];
const RELIGIONS = ['Christian', 'Muslim', 'Traditionalist', 'Bahai', 'None', 'Other'];
const PAYMENTS = ['Cash', 'Employer', 'Insurance', 'Free', 'Other'];
const RELATIONSHIPS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Nephew', 'Niece', 'Cousin', 'Friend', 'Self', 'Other'];
const SEXES = [
  ['M', 'Male'],
  ['F', 'Female'],
  ['O', 'Other'],
  ['U', 'Unknown'],
];

const emptyDemographics = () => ({
  hospitalNumber: '',
  title: '',
  givenName: '',
  middleName: '',
  familyName: '',
  gender: '',
  birthdate: '',
  telephone: '',
  nationalId: '',
  country: '',
  region: '',
  division: '',
  subdivision: '',
  village: '',
  quarter: '',
  villageOfOrigin: '',
  occupation: '',
  employer: '',
  employerNumber: '',
  religion: '',
  church: '',
  paymentMethod: '',
  contactName: '',
  contactRelationship: '',
  contactPhone: '',
  responsibleParty: '',
  responsiblePartyRelationship: '',
});

const state = {
  selected: 'demographics',
  demographics: emptyDemographics(),
  exam: {
    procedure: '',
    examDate: new Date().toISOString().slice(0, 10),
    endoscopist: '',
    extentOrgan: '',
    extentSite: '',
    reasons: [],
    findings: [],
    interventions: [],
    diagnoses: [],
    events: [],
  },
  photos: [],
  narrative: '',
};

let dict = null;
let saveTimer = null;

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

function procedure() {
  return dict.procedures.find((item) => item.id === state.exam.procedure) || null;
}

function anatomyFor(organ) {
  const proc = procedure();
  if (!organ) return { sites: [], modifiers: [] };
  if (proc && proc.findingSet === 'eus') {
    const key = (dict.eusAnatomyKey && dict.eusAnatomyKey[organ]) || organ;
    return dict.eusAnatomy[key] || { sites: [], modifiers: [] };
  }
  if (organ === 'Major papilla' || organ === 'Minor papilla') {
    return dict.anatomy.Duodenum || { sites: [], modifiers: [] };
  }
  return dict.anatomy[organ] || { sites: [], modifiers: [] };
}

function findingsFor(organ) {
  const proc = procedure();
  if (!proc || !organ) return [];
  const match = (item) => !item.organs || item.organs.length === 0 || item.organs.includes(organ);
  if (proc.findingSet === 'eus') return dict.eusFindings.filter(match);
  const luminalOrgans = ['Esophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Ileum', 'Colon'];
  if (proc.findingSet === 'ercp' && !luminalOrgans.includes(organ)) return dict.ercpFindings.filter(match);
  return dict.luminalFindings.filter(match);
}

function headingsOf(items) {
  const headings = [];
  items.forEach((item) => {
    const heading = item.heading || 'Finding';
    if (!headings.includes(heading)) headings.push(heading);
  });
  return headings;
}

const ELEVATED_ORGANS = ['Stomach', 'Duodenum'];

function headingLabel(organ, heading) {
  if (ELEVATED_ORGANS.includes(organ) && heading === 'Protruding lesions') return 'Elevated lesions';
  return heading;
}

function headingOptions(organ, headings, current) {
  const list = [...headings];
  if (current && !list.includes(current)) list.unshift(current);
  const options = ['<option value="">Select…</option>'];
  list.forEach((heading) => {
    options.push(`<option value="${esc(heading)}"${heading === current ? ' selected' : ''}>${esc(headingLabel(organ, heading))}</option>`);
  });
  return options.join('');
}

function interventionsFor() {
  const proc = procedure();
  if (!proc) return [];
  return proc.interventionKeys.flatMap((key) => (dict.interventions[key] || []).map((item) => ({ ...item, group: key })));
}

function diagnosesFor() {
  const proc = procedure();
  if (!proc) return [];
  const terms = [];
  proc.diagnosisKeys.forEach((key) => {
    (dict.diagnoses[key] || []).forEach((term) => {
      if (!terms.includes(term)) terms.push(term);
    });
  });
  return terms;
}

function reasonsFor() {
  const proc = procedure();
  if (!proc) return [];
  return dict.reasons[proc.reasonKey] || [];
}

function isMeasurement(value) {
  return /specify|\.\.\.|xx\b|\bmm\b|^ml\b|^#$|french|classification|relevant structure|size\/number/i.test(value || '');
}

function selectOptions(values, current, placeholder) {
  const list = [...values];
  if (current && !list.includes(current)) list.unshift(current);
  const options = [`<option value="">${esc(placeholder || 'Select…')}</option>`];
  list.forEach((value) => {
    options.push(`<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value)}</option>`);
  });
  return options.join('');
}

function textField(label, bind, value, placeholder) {
  const id = bind.replace(/\./g, '-');
  return `<div class="field"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="text" data-bind="${esc(bind)}" value="${esc(value)}" placeholder="${esc(placeholder || '')}" /></div>`;
}

function codedField(label, bind, value, options) {
  const pairs = options.map((option) => (Array.isArray(option) ? option : [option, option]));
  return `<div class="field"><label>${esc(label)}</label><select data-bind="${esc(bind)}">${selectOptions(pairs.map((pair) => pair[0]), value).replace(/>([^<]*)</g, (all, labelText) => {
    const pair = pairs.find((item) => item[0] === labelText);
    return pair ? `>${esc(pair[1])}<` : all;
  })}</select></div>`;
}

function sexField() {
  const options = ['<option value="">Select…</option>'].concat(SEXES.map(([value, label]) => `<option value="${value}"${state.demographics.gender === value ? ' selected' : ''}>${label}</option>`));
  return `<div class="field"><label>Sex</label><select data-bind="demographics.gender">${options.join('')}</select></div>`;
}

function renderDemographics() {
  const d = state.demographics;
  const coded = (label, bind, value, options) => `<div class="field"><label>${esc(label)}</label><select data-bind="${esc(bind)}">${selectOptions(options, value)}</select></div>`;
  return `
    <h2>Demographics</h2>
    <p class="lede">Same sections as the Mbingo EMR demographic screen. This copy stays in the endoscopy report.</p>
    <h3 class="section-title">Name & identity</h3>
    <div class="grid">
      ${textField('Hospital number', 'demographics.hospitalNumber', d.hospitalNumber)}
      ${coded('Title', 'demographics.title', d.title, TITLES)}
      ${textField('Given name', 'demographics.givenName', d.givenName)}
      ${textField('Middle name', 'demographics.middleName', d.middleName)}
      ${textField('Family name', 'demographics.familyName', d.familyName)}
      ${sexField()}
      <div class="field"><label>Date of birth</label><input type="date" data-bind="demographics.birthdate" value="${esc(d.birthdate)}" /></div>
      ${textField('Telephone', 'demographics.telephone', d.telephone)}
      ${textField('National ID', 'demographics.nationalId', d.nationalId)}
    </div>
    <h3 class="section-title">Address</h3>
    <div class="grid">
      ${textField('Country', 'demographics.country', d.country)}
      ${textField('Region', 'demographics.region', d.region)}
      ${textField('Division', 'demographics.division', d.division)}
      ${textField('Subdivision', 'demographics.subdivision', d.subdivision)}
      ${textField('Village', 'demographics.village', d.village)}
      ${textField('Quarter', 'demographics.quarter', d.quarter)}
    </div>
    <h3 class="section-title">Additional information (MBH)</h3>
    <div class="grid">
      ${textField('Village of origin', 'demographics.villageOfOrigin', d.villageOfOrigin)}
      ${textField('Occupation', 'demographics.occupation', d.occupation)}
      ${textField('Employer', 'demographics.employer', d.employer)}
      ${textField('Employer #', 'demographics.employerNumber', d.employerNumber)}
      ${coded('Religion', 'demographics.religion', d.religion, RELIGIONS)}
      ${textField('Church', 'demographics.church', d.church)}
      ${coded('Payment method', 'demographics.paymentMethod', d.paymentMethod, PAYMENTS)}
    </div>
    <h3 class="section-title">Next of kin & responsible party</h3>
    <div class="grid">
      ${textField('Contact name', 'demographics.contactName', d.contactName)}
      ${coded('Contact relationship', 'demographics.contactRelationship', d.contactRelationship, RELATIONSHIPS)}
      ${textField('Contact phone', 'demographics.contactPhone', d.contactPhone)}
      ${textField('Responsible party', 'demographics.responsibleParty', d.responsibleParty)}
      ${coded('RP relationship', 'demographics.responsiblePartyRelationship', d.responsiblePartyRelationship, RELATIONSHIPS)}
    </div>`;
}

function requireProcedure() {
  return `<div class="empty">Choose the procedure on Examination before adding this part of the report.</div>`;
}

function renderExam() {
  const proc = procedure();
  const organs = proc ? proc.organs : [];
  const sites = anatomyFor(state.exam.extentOrgan).sites || [];
  return `
    <h2>Examination</h2>
    <p class="lede">Choose the procedure, then document each level in order — esophagus, stomach, and duodenum.</p>
    <ul class="field-tree"><li>
      <div class="node-field"><label>Procedure</label>
        <select data-bind="exam.procedure">${selectOptions(dict.procedures.map((item) => item.id), state.exam.procedure).replace(/value="([^"]+)"/g, (all, id) => {
          const item = dict.procedures.find((entry) => entry.id === id);
          return item ? `value="${esc(item.id)}"` : all;
        })}</select>
      </div>
      <ul>
        <li><div class="node-field"><label>Exam date</label><input type="date" data-bind="exam.examDate" value="${esc(state.exam.examDate)}" /></div></li>
        <li><div class="node-field"><label>Endoscopist</label><input type="text" data-bind="exam.endoscopist" value="${esc(state.exam.endoscopist)}" /></div></li>
        <li><div class="node-field"><label>Extent reached — organ</label>
          <select data-bind="exam.extentOrgan" ${organs.length ? '' : 'disabled'}>${selectOptions(organs, state.exam.extentOrgan, organs.length ? 'Select…' : 'Choose a procedure first')}</select>
        </div>
          <ul><li><div class="node-field"><label>Site</label>
            <select data-bind="exam.extentSite">${selectOptions(sites, state.exam.extentSite)}</select>
          </div></li></ul>
        </li>
      </ul>
    </li></ul>
    ${firstLevelJump()}`;
}

function optionLabels(html, items) {
  return html.replace(/<option value="([^"]*)">[^<]*<\/option>/g, (all, value) => {
    if (!value) return all;
    const item = items.find((entry) => entry.id === value);
    return item ? `<option value="${esc(item.id)}">${esc(item.label)}</option>` : all;
  });
}

function renderReason(reason) {
  const groups = reasonsFor();
  if (!groups.length) return `<h2>Reason</h2>${requireProcedure()}`;
  const group = groups.find((item) => item.category === reason.category);
  const terms = group ? group.terms : [];
  const qualifiers = group ? group.qualifiers : [];
  return `
    <h2>Reason for endoscopy</h2>
    <ul class="field-tree"><li>
      <div class="node-field"><label>Category</label>
        <select data-kind="reason" data-id="${reason.id}" data-field="category">${selectOptions(groups.map((item) => item.category), reason.category)}</select>
      </div>
      <ul>
        <li><div class="node-field"><label>Term</label>
          <select data-kind="reason" data-id="${reason.id}" data-field="term">${selectOptions(terms, reason.term)}</select>
        </div>
          <ul><li><div class="node-field"><label>Qualifier</label>
            <select data-kind="reason" data-id="${reason.id}" data-field="qualifier">${selectOptions(qualifiers, reason.qualifier)}</select>
            <input type="text" data-kind="reason" data-id="${reason.id}" data-field="detail" value="${esc(reason.detail)}" placeholder="Duration, degree, or other detail" />
          </div></li></ul>
        </li>
      </ul>
    </li></ul>
    ${removeButton('reason', reason.id)}`;
}

function attributeControl(kind, id, attr, current, sites) {
  const value = current?.value || '';
  const detail = current?.detail || '';
  const needsDetail = isMeasurement(value) || (attr.hints || []).length > 0 && !attr.values?.length;
  let control = '';
  if (attr.useSites) {
    control += `<select data-kind="${kind}" data-id="${id}" data-field="attr" data-name="${esc(attr.name)}">${selectOptions(sites, value, 'Select site…')}</select>`;
  } else if (attr.values && attr.values.length) {
    control += `<select data-kind="${kind}" data-id="${id}" data-field="attr" data-name="${esc(attr.name)}">${selectOptions(attr.values, value)}</select>`;
  } else {
    control += `<input type="text" data-kind="${kind}" data-id="${id}" data-field="attr" data-name="${esc(attr.name)}" value="${esc(value)}" placeholder="${esc((attr.hints || []).join(', ') || 'Specify')}" />`;
  }
  if (attr.values && attr.values.length && (needsDetail || detail)) {
    control += `<input type="text" data-kind="${kind}" data-id="${id}" data-field="attrDetail" data-name="${esc(attr.name)}" value="${esc(detail)}" placeholder="${esc((attr.hints || []).join(', ') || 'Detail')}" />`;
  }
  const hint = (attr.hints || []).filter((item) => item && item !== value).join(' · ');
  return `<li><div class="node-field"><label>${esc(attr.name)}</label>${control}${hint && attr.values?.length ? `<span class="hint">${esc(hint)}</span>` : ''}</div></li>`;
}

const UPPER_LEVELS = ['Esophagus', 'Stomach', 'Duodenum'];

function findingMode(finding) {
  if (finding.statement === 'normal') return 'normal';
  if (finding.statement === 'abnormal' || finding.term || finding.heading) return 'abnormal';
  return '';
}

function levelOrder() {
  const proc = procedure();
  const organs = proc ? proc.organs.slice() : [];
  const ordered = [];
  UPPER_LEVELS.forEach((name) => {
    if (organs.includes(name)) ordered.push(name);
  });
  organs.forEach((name) => {
    if (!ordered.includes(name)) ordered.push(name);
  });
  state.exam.findings.forEach((finding) => {
    if (finding.organ && !ordered.includes(finding.organ)) ordered.push(finding.organ);
  });
  return ordered;
}

function findingsForOrgan(organ) {
  return state.exam.findings.filter((finding) => finding.organ === organ);
}

function levelStatus(organ) {
  const items = findingsForOrgan(organ);
  if (!items.length) return 'empty';
  if (items.every((finding) => findingMode(finding) === 'normal')) return 'normal';
  return 'abnormal';
}

function levelSummary(organ) {
  const status = levelStatus(organ);
  if (status === 'empty') return 'Not documented';
  if (status === 'normal') {
    const finding = findingsForOrgan(organ).find((item) => findingMode(item) === 'normal');
    return finding && finding.site ? `No abnormality — ${finding.site}` : 'No abnormality noted';
  }
  const items = findingsForOrgan(organ).filter((item) => findingMode(item) !== 'normal');
  const first = items.map((item) => [item.term, item.site].filter(Boolean).join(' — ')).find(Boolean);
  if (!first) return 'Abnormal';
  if (items.length === 1) return first;
  return `${items.map((item) => item.term).find(Boolean) || first} +${items.length - 1}`;
}

function levelDomId(organ) {
  return `level-${String(organ).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function blankFinding(organ, statement) {
  return {
    id: uid(),
    organ,
    heading: '',
    term: '',
    site: '',
    modifier: '',
    modifierDetail: '',
    attributes: {},
    statement,
  };
}

function findingHasDetail(item) {
  if (findingMode(item) !== 'abnormal') return false;
  if (item.term || item.heading || item.site || item.modifier || item.modifierDetail) return true;
  return Object.values(item.attributes || {}).some((attr) => attr && (attr.value || attr.detail));
}

function setLevelStatus(organ, status) {
  if (status === 'empty') {
    state.exam.findings = state.exam.findings.filter((finding) => finding.organ !== organ);
    return;
  }
  if (status === 'normal') {
    const previous = findingsForOrgan(organ).find((finding) => findingMode(finding) === 'normal') || {};
    state.exam.findings = state.exam.findings.filter((finding) => finding.organ !== organ);
    const finding = blankFinding(organ, 'normal');
    finding.site = previous.site || '';
    finding.modifier = previous.modifier || '';
    finding.modifierDetail = previous.modifierDetail || '';
    state.exam.findings.push(finding);
    return;
  }
  state.exam.findings = state.exam.findings.filter((finding) => !(finding.organ === organ && findingMode(finding) === 'normal'));
  if (!findingsForOrgan(organ).some((finding) => findingMode(finding) === 'abnormal')) {
    state.exam.findings.push(blankFinding(organ, 'abnormal'));
  }
}

function modifierPhrase(finding) {
  const modifier = finding.modifier || '';
  const detail = String(finding.modifierDetail || '').trim();
  if (modifier && detail && /\bxx\b/i.test(modifier)) return modifier.replace(/\bxx\b/i, detail);
  return [modifier, detail].filter(Boolean).join(' ');
}

function normalSentence(finding) {
  const where = [finding.organ, finding.site, modifierPhrase(finding)].filter(Boolean).join(', ');
  return where ? `${where}: No abnormality noted.` : 'No abnormality noted.';
}

function renderAnatomy(finding) {
  const anatomy = anatomyFor(finding.organ);
  const sites = anatomy.sites || [];
  const modifiers = anatomy.modifiers || [];
  const chips = (values, field) => values.map((value) => `
    <button type="button" class="chip${finding[field] === value ? ' is-on' : ''}" data-action="set-anatomy" data-id="${finding.id}" data-field="${field}" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  const showDetail = Boolean(finding.modifierDetail) || isMeasurement(finding.modifier) || modifiers.length === 0;
  const detail = showDetail ? `<input class="anatomy-detail" type="text" data-kind="finding" data-id="${finding.id}" data-field="modifierDetail" value="${esc(finding.modifierDetail)}" placeholder="${esc(isMeasurement(finding.modifier) ? finding.modifier : 'Measurement or detail')}" />` : '';
  return `
    <div class="anatomy">
      ${sites.length ? `<div><div class="anatomy-label">Site</div><div class="chip-row">${chips(sites, 'site')}</div></div>` : ''}
      ${modifiers.length ? `<div><div class="anatomy-label">Modifier</div><div class="chip-row">${chips(modifiers, 'modifier')}</div>${detail}</div>` : detail}
    </div>`;
}

function renderAnatomyCatalog(organ) {
  const anatomy = anatomyFor(organ);
  const sites = anatomy.sites || [];
  const modifiers = anatomy.modifiers || [];
  const chips = (values) => values.map((value) => `<span class="chip chip-static">${esc(value)}</span>`).join('');
  if (!sites.length && !modifiers.length) return '';
  return `
    <div class="anatomy">
      ${sites.length ? `<div><div class="anatomy-label">Sites</div><div class="chip-row">${chips(sites)}</div></div>` : ''}
      ${modifiers.length ? `<div><div class="anatomy-label">Modifiers</div><div class="chip-row">${chips(modifiers)}</div></div>` : ''}
    </div>`;
}

function firstLevelJump() {
  const first = procedure() ? levelOrder()[0] : '';
  if (!first) return '';
  return `<p class="level-jump"><button type="button" class="btn btn-secondary" data-action="goto-level" data-organ="${esc(first)}">Document ${esc(first)}</button></p>`;
}

function statusButtons(organ, status) {
  const choices = [
    ['empty', 'Not documented'],
    ['normal', 'No abnormality noted'],
    ['abnormal', 'Abnormal'],
  ];
  return `<div class="status-row" role="group" aria-label="${esc(organ)} status">${choices.map(([value, label]) => `
    <button type="button" class="status-btn${status === value ? ' is-on' : ''}" aria-pressed="${status === value ? 'true' : 'false'}" data-action="level-status" data-organ="${esc(organ)}" data-status="${value}">${label}</button>`).join('')}</div>`;
}

function renderNormalLevel(organ) {
  const finding = findingsForOrgan(organ).find((item) => findingMode(item) === 'normal');
  if (!finding) return '';
  return `
    <p class="statement">${esc(normalSentence(finding))}</p>
    ${renderAnatomy(finding)}`;
}

function renderAbnormalFinding(finding, index) {
  const proc = procedure();
  const anatomy = anatomyFor(finding.organ);
  const sites = anatomy.sites || [];
  const catalog = findingsFor(finding.organ);
  const headings = headingsOf(catalog);
  const showHeading = proc && proc.findingSet !== 'eus' && headings.length > 0;
  const terms = catalog.filter((item) => !showHeading || item.heading === finding.heading);
  const selected = terms.find((item) => item.term === finding.term) || null;
  const attrs = (selected && selected.attributes) || [];
  const attrHtml = attrs.map((attr) => attributeControl('finding', finding.id, attr, (finding.attributes || {})[attr.name], sites)).join('');
  const termBlock = `
    <div class="node-field"><label>Term</label>
      <select data-kind="finding" data-id="${finding.id}" data-field="term">${selectOptions(terms.map((item) => item.term), finding.term)}</select>
    </div>
    ${attrHtml ? `<ul>${attrHtml}</ul>` : ''}`;
  const body = showHeading
    ? `<div class="node-field"><label>Heading</label>
        <select data-kind="finding" data-id="${finding.id}" data-field="heading">${headingOptions(finding.organ, headings, finding.heading)}</select>
      </div><ul><li>${termBlock}</li></ul>`
    : termBlock;
  return `
    <article class="finding-card">
      <h4>Finding ${index + 1}</h4>
      ${renderAnatomy(finding)}
      <ul class="field-tree"><li>${body}</li></ul>
      ${removeButton('finding', finding.id)}
    </article>`;
}

function renderUnassigned(finding) {
  const organs = procedure() ? procedure().organs : UPPER_LEVELS;
  return `
    <article class="finding-card">
      <h4>Finding not placed on a level</h4>
      <div class="node-field"><label>Level</label>
        <select data-kind="finding" data-id="${finding.id}" data-field="organ">${selectOptions(organs, finding.organ, 'Choose a level…')}</select>
      </div>
      ${removeButton('finding', finding.id)}
    </article>`;
}

function renderLevels() {
  const proc = procedure();
  const organs = levelOrder();
  const classic = UPPER_LEVELS.every((name) => organs.includes(name));
  const lede = !proc
    ? 'Document each level in order: esophagus, then stomach, then duodenum.'
    : classic
      ? `Document each level in order: esophagus, then stomach, then duodenum. Record the site and modifier for each one.${organs.length > UPPER_LEVELS.length ? ' If the scope goes further, document that level after the duodenum.' : ''}`
      : 'Document each level in order.';
  if (!proc) return `<h2>Findings by level</h2><p class="lede">${lede}</p>${requireProcedure()}`;
  const active = state.selected.startsWith('level:') ? state.selected.slice('level:'.length) : '';
  const rail = organs.map((organ, index) => `
    <li><button type="button" class="rail-btn${organ === active ? ' is-on' : ''}" data-action="goto-level" data-organ="${esc(organ)}">
      <span class="rail-index">${index + 1}</span>
      <span class="rail-name">${esc(organ)}<small>${esc(levelSummary(organ))}</small></span>
    </button></li>`).join('');
  const sections = organs.map((organ, index) => {
    const status = levelStatus(organ);
    const abnormal = findingsForOrgan(organ).filter((finding) => findingMode(finding) !== 'normal');
    let body = `${renderAnatomyCatalog(organ)}<p class="hint">Mark this level, then choose the site and modifier.</p>`;
    if (status === 'normal') body = renderNormalLevel(organ);
    if (status === 'abnormal') {
      body = abnormal.map((finding, findingIndex) => renderAbnormalFinding(finding, findingIndex)).join('')
        + `<button type="button" class="btn btn-secondary" data-action="add-finding" data-organ="${esc(organ)}">+ Add finding</button>`;
    }
    const next = organs[index + 1];
    return `
      <section class="level${organ === active ? ' is-active' : ''}" id="${levelDomId(organ)}">
        <header class="level-head">
          <div class="level-index">${index + 1}</div>
          <div>
            <h3>${esc(organ)}</h3>
            ${statusButtons(organ, status)}
          </div>
        </header>
        <div class="level-body">
          ${body}
          ${next ? `<div class="level-next"><button type="button" class="btn btn-secondary" data-action="goto-level" data-organ="${esc(next)}">Continue to ${esc(next)}</button></div>` : ''}
        </div>
      </section>`;
  }).join('');
  const loose = state.exam.findings.filter((finding) => !finding.organ).map(renderUnassigned).join('');
  return `
    <h2>Findings by level</h2>
    <p class="lede">${lede}</p>
    <ol class="level-rail">${rail}</ol>
    <div class="level-list">${sections}${loose}</div>`;
}

function renderIntervention(item) {
  const methods = interventionsFor();
  if (!methods.length) return `<h2>Intervention</h2>${requireProcedure()}`;
  const selected = methods.find((entry) => entry.method === item.method && entry.group === item.group)
    || methods.find((entry) => entry.method === item.method);
  const groupLabel = { luminal: 'Luminal', ercp: 'ERCP', eus: 'EUS' };
  const choices = methods.map((entry) => `${entry.group}::${entry.method}`);
  const current = item.group && item.method ? `${item.group}::${item.method}` : '';
  const labels = methods.map((entry) => `${groupLabel[entry.group] || entry.group} — ${entry.method}`);
  const optionHtml = ['<option value="">Select…</option>'].concat(methods.map((entry, index) => {
    const value = `${entry.group}::${entry.method}`;
    return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(labels[index])}</option>`;
  })).join('');
  const attrs = ((selected && selected.attributes) || []).map((attr) => attributeControl('intervention', item.id, attr, item.attributes[attr.name], allSites())).join('');
  return `
    <h2>Intervention</h2>
    <ul class="field-tree"><li>
      <div class="node-field"><label>Method</label><select data-kind="intervention" data-id="${item.id}" data-field="method">${optionHtml}</select></div>
      <ul>${attrs}</ul>
    </li></ul>
    ${removeButton('intervention', item.id)}`;
}

function renderDiagnosis(item) {
  const terms = diagnosesFor();
  if (!terms.length) return `<h2>Diagnosis</h2>${requireProcedure()}`;
  return `
    <h2>Endoscopic diagnosis</h2>
    <ul class="field-tree"><li>
      <div class="node-field"><label>Term</label>
        <select data-kind="diagnosis" data-id="${item.id}" data-field="term">${selectOptions(terms, item.term)}</select>
      </div>
    </li></ul>
    ${removeButton('diagnosis', item.id)}`;
}

function allSites() {
  const proc = procedure();
  if (!proc) return [];
  const sites = [];
  proc.organs.forEach((organ) => {
    (anatomyFor(organ).sites || []).forEach((site) => {
      const label = `${organ} — ${site}`;
      if (!sites.includes(label)) sites.push(label);
    });
  });
  return sites;
}

const NO_ADVERSE_EVENT = 'No adverse events during the procedure';

function isNoAdverseEvent(item) {
  return item.type === NO_ADVERSE_EVENT;
}

function renderEvent(item) {
  const phase = item.phase || 'intraprocedure';
  const catalog = dict.adverseEvents[phase] || [];
  const none = isNoAdverseEvent(item);
  const selected = catalog.find((entry) => entry.type === item.type);
  const attrs = ((selected && selected.attributes) || []).map((attr) => {
    const copy = { ...attr };
    if (copy.useSites) {
      copy.values = allSites();
      copy.useSites = false;
    }
    return attributeControl('event', item.id, copy, item.attributes[attr.name], []);
  }).join('');
  const criteria = (dict.severity.criteria || []).filter((entry) => entry.severity === item.severity).map((entry) => entry.outcome);
  const actions = (dict.eventActions || []).map((action) => {
    const comment = (dict.actionComments && dict.actionComments[action]) || '';
    const checked = (item.actions || []).includes(action) ? ' checked' : '';
    const hidden = phase === 'postprocedure' && /intraproc/i.test(comment);
    if (hidden) return '';
    return `<label><input type="checkbox" data-kind="event" data-id="${item.id}" data-field="action" value="${esc(action)}"${checked} /> ${esc(action)}${comment ? ` <span class="hint">${esc(comment)}</span>` : ''}</label>`;
  }).join('');
  return `
    <h2>Adverse event</h2>
    <ul class="field-tree"><li>
      <div class="node-field"><label>When</label>
        <select data-kind="event" data-id="${item.id}" data-field="phase">
          <option value="intraprocedure"${phase === 'intraprocedure' ? ' selected' : ''}>Intraprocedure</option>
          <option value="postprocedure"${phase === 'postprocedure' ? ' selected' : ''}>Postprocedure</option>
        </select>
      </div>
      <ul>
        <li><div class="node-field"><label>Type</label>
          <select data-kind="event" data-id="${item.id}" data-field="type">${selectOptions(catalog.map((entry) => entry.type), item.type)}</select>
        </div><ul>${attrs}</ul></li>
        ${none ? '' : `<li><div class="node-field"><label>Severity</label>
          <select data-kind="event" data-id="${item.id}" data-field="severity">${selectOptions(dict.severity.levels || [], item.severity)}</select>
          ${criteria.length ? `<div class="criteria">${criteria.map((line) => esc(line)).join('<br>')}</div>` : ''}
        </div></li>
        <li><div class="node-field"><label>Actions</label><div class="check-list">${actions}</div></div></li>
        <li><div class="node-field"><label>Outcome</label>
          <select data-kind="event" data-id="${item.id}" data-field="outcome">${selectOptions(dict.eventOutcomes || [], item.outcome)}</select>
        </div></li>`}
      </ul>
    </li></ul>
    ${removeButton('event', item.id)}`;
}

function renderImages() {
  const cards = state.photos.map((photo) => `
    <article class="photo-card">
      <img src="${photo.dataUrl}" alt="${esc(photo.name)}" />
      <input type="text" data-kind="photo" data-id="${photo.id}" data-field="caption" value="${esc(photo.caption)}" placeholder="Caption" />
      <div class="row-actions"><button type="button" class="btn btn-danger" data-action="remove-photo" data-id="${photo.id}">Remove</button></div>
    </article>`).join('');
  return `
    <h2>Images</h2>
    <p class="lede">Import endoscopy photos from this computer. They are stored with this report in the browser.</p>
    <input id="photo-input" type="file" accept="image/*" multiple />
    ${state.photos.length ? `<div class="photos">${cards}</div>` : `<div class="empty">No photos imported yet.</div>`}`;
}

function renderNarrative() {
  return `
    <h2>Free text</h2>
    <p class="lede">Narrative at the end of the report. The structured tree above is kept as well.</p>
    <div class="field wide"><label>Report narrative</label>
      <textarea data-bind="narrative" placeholder="Additional description, impression, or recommendations">${esc(state.narrative)}</textarea>
    </div>`;
}

function describeAttr(attr) {
  if (!attr) return '';
  const value = attr.value || '';
  const detail = attr.detail || '';
  return [value, detail].filter(Boolean).join(' ');
}

function renderPreview() {
  const d = state.demographics;
  const name = [d.title, d.givenName, d.middleName, d.familyName].filter(Boolean).join(' ') || 'Unnamed patient';
  const proc = procedure();
  const line = (label, value) => value ? `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>` : '';
  const reasons = state.exam.reasons.map((item) => `<li>${esc([item.category, item.term, item.qualifier, item.detail].filter(Boolean).join(' — '))}</li>`).join('');
  const findings = renderFindingsBlock();
  const interventions = state.exam.interventions.map((item) => {
    const attrs = Object.entries(item.attributes || {}).map(([name, value]) => `${name}: ${describeAttr(value)}`).filter((text) => !text.endsWith(': '));
    return `<li>${esc(item.method || 'Intervention')}${attrs.length ? ` — ${esc(attrs.join('; '))}` : ''}</li>`;
  }).join('');
  const diagnoses = state.exam.diagnoses.map((item) => `<li>${esc(item.term || 'Diagnosis')}</li>`).join('');
  const events = state.exam.events.map((item) => {
    if (isNoAdverseEvent(item)) return `<li>${esc(item.type)}</li>`;
    return `<li>${esc([item.phase, item.type, item.severity, item.outcome].filter(Boolean).join(' · '))}</li>`;
  }).join('');
  const photos = state.photos.map((photo) => `<figure><img src="${photo.dataUrl}" alt="${esc(photo.caption || photo.name)}" /><figcaption>${esc(photo.caption || photo.name)}</figcaption></figure>`).join('');
  return `
    <h2>Preview</h2>
    <article class="note">
      <h3>${esc(name)}</h3>
      ${line('Hospital number', d.hospitalNumber)}
      ${line('Sex', (SEXES.find((item) => item[0] === d.gender) || [])[1] || d.gender)}
      ${line('Date of birth', d.birthdate)}
      ${line('Telephone', d.telephone)}
      ${line('Village', [d.village, d.quarter, d.subdivision, d.division, d.region, d.country].filter(Boolean).join(', '))}
      <h3>Examination</h3>
      ${line('Procedure', proc ? proc.label : '')}
      ${line('Date', state.exam.examDate)}
      ${line('Endoscopist', state.exam.endoscopist)}
      ${line('Extent', [state.exam.extentOrgan, state.exam.extentSite].filter(Boolean).join(' — '))}
      ${reasons ? `<h3>Reasons</h3><ul>${reasons}</ul>` : ''}
      ${findings}
      ${interventions ? `<h3>Interventions</h3><ul>${interventions}</ul>` : ''}
      ${diagnoses ? `<h3>Diagnoses</h3><ul>${diagnoses}</ul>` : ''}
      ${events ? `<h3>Adverse events</h3><ul>${events}</ul>` : ''}
      ${photos ? `<h3>Images</h3>${photos}` : ''}
      <h3>Narrative</h3>
      <p>${esc(state.narrative || '—').replace(/\n/g, '<br>')}</p>
    </article>`;
}

function findingLine(item) {
  if (findingMode(item) === 'normal') return `<li>${esc(normalSentence(item))}</li>`;
  const bits = [headingLabel(item.organ, item.heading), item.term, item.site, modifierPhrase(item)].filter(Boolean);
  const attrs = Object.entries(item.attributes || {}).map(([name, value]) => `${name}: ${describeAttr(value)}`).filter((text) => !text.endsWith(': '));
  return `<li>${esc(bits.join(' · ') || 'Abnormal finding')}${attrs.length ? `<br>${esc(attrs.join('; '))}` : ''}</li>`;
}

function renderFindingsBlock() {
  const organs = levelOrder().slice();
  if (state.exam.findings.some((item) => !item.organ)) organs.push('');
  const blocks = organs.map((organ) => {
    const items = organ ? findingsForOrgan(organ) : state.exam.findings.filter((item) => !item.organ);
    if (!items.length) return '';
    return `<h4>${esc(organ || 'Level not set')}</h4><ul>${items.map(findingLine).join('')}</ul>`;
  }).join('');
  return blocks ? `<h3>Findings</h3>${blocks}` : '';
}

function removeButton(kind, id) {
  return `<div class="row-actions"><button type="button" class="btn btn-danger" data-action="remove" data-kind="${kind}" data-id="${id}">Remove</button></div>`;
}

function renderMain() {
  const main = $('#main');
  const scroll = main.scrollTop;
  const key = state.selected;
  let html = '';
  if (key === 'demographics') html = renderDemographics();
  else if (key === 'exam') html = renderExam().replace('data-bind="exam.procedure">', 'data-bind="exam.procedure">').replace(/<option value="(EGD|Enteroscopy|VCE|Colonoscopy|ERCP|EUS)">[^<]*<\/option>/g, (all, id) => {
    const item = dict.procedures.find((entry) => entry.id === id);
    return item ? `<option value="${item.id}"${state.exam.procedure === item.id ? ' selected' : ''}>${esc(item.label)}</option>` : all;
  });
  else if (key === 'images') html = renderImages();
  else if (key === 'narrative') html = renderNarrative();
  else if (key === 'preview') html = renderPreview();
  else if (key === 'levels' || key.startsWith('level:')) html = renderLevels();
  else {
    const [kind, id] = key.split(':');
    const collection = {
      reason: state.exam.reasons,
      intervention: state.exam.interventions,
      diagnosis: state.exam.diagnoses,
      event: state.exam.events,
    }[kind] || [];
    const item = collection.find((entry) => entry.id === id);
    if (!item) html = `<div class="empty">This item is no longer in the report.</div>`;
    else if (kind === 'reason') html = renderReason(item);
    else if (kind === 'intervention') html = renderIntervention(item);
    else if (kind === 'diagnosis') html = renderDiagnosis(item);
    else if (kind === 'event') html = renderEvent(item);
  }
  main.innerHTML = html;
  main.scrollTop = scroll;
  const examSelect = main.querySelector('[data-bind="exam.procedure"]');
  if (examSelect) {
    [...examSelect.options].forEach((option) => {
      const item = dict.procedures.find((entry) => entry.id === option.value);
      if (item) option.textContent = item.label;
    });
  }
}

function treeButton(id, label, sub, extraClass) {
  const active = state.selected === id ? ' active' : '';
  return `<button type="button" class="tree-label${active}${extraClass ? ` ${extraClass}` : ''}" data-select="${esc(id)}"><span><strong>${esc(label)}</strong>${sub ? `<br><small>${esc(sub)}</small>` : ''}</span></button>`;
}

function treeItems(kind, items, labelOf, noun) {
  return items.map((item) => `<button type="button" class="tree-item${state.selected === `${kind}:${item.id}` ? ' active' : ''}" data-select="${kind}:${item.id}"><span>${esc(labelOf(item))}</span></button>`).join('')
    + `<button type="button" class="tree-add" data-action="add" data-kind="${kind}">+ Add ${esc(noun)}</button>`;
}

function renderTree() {
  const proc = procedure();
  const reasonLabel = (item) => item.term || item.category || 'New reason';
  const interventionLabel = (item) => item.method || 'New intervention';
  const diagnosisLabel = (item) => item.term || 'New diagnosis';
  const eventLabel = (item) => item.type || 'New adverse event';
  const levels = proc ? levelOrder() : [];
  const levelHint = UPPER_LEVELS.every((name) => levels.includes(name)) ? 'Esophagus, stomach, duodenum' : 'In procedure order';
  const levelNav = levels.length
    ? `<div class="tree-label static"><span><strong>Levels</strong><br><small>${esc(levelHint)}</small></span></div>${levels.map((organ, index) => treeButton(`level:${organ}`, `${index + 1}. ${organ}`, levelSummary(organ), 'tree-level')).join('')}`
    : '';
  $('#tree').innerHTML = `
    <div class="tree-section">${treeButton('demographics', 'Demographics', [state.demographics.givenName, state.demographics.familyName].filter(Boolean).join(' '))}</div>
    <div class="tree-section">
      ${treeButton('exam', 'Examination', proc ? proc.label : 'Choose procedure')}
      ${treeItems('reason', state.exam.reasons, reasonLabel, 'reason')}
      ${levelNav}
      ${treeItems('intervention', state.exam.interventions, interventionLabel, 'intervention')}
      ${treeItems('diagnosis', state.exam.diagnoses, diagnosisLabel, 'diagnosis')}
      ${treeItems('event', state.exam.events, eventLabel, 'adverse event')}
    </div>
    <div class="tree-section">${treeButton('images', 'Images', state.photos.length ? `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'}` : 'Import photos')}</div>
    <div class="tree-section">${treeButton('narrative', 'Free text', state.narrative ? 'Narrative entered' : 'End of report')}</div>`;
}

function addItem(kind, extra) {
  if (!procedure()) {
    state.selected = 'exam';
    render();
    return;
  }
  const id = uid();
  if (kind === 'reason') state.exam.reasons.push({ id, category: '', term: '', qualifier: '', detail: '' });
  if (kind === 'finding') {
    state.exam.findings.push({
      id,
      organ: '',
      heading: '',
      term: '',
      site: '',
      modifier: '',
      modifierDetail: '',
      attributes: {},
      statement: extra === 'normal' ? 'normal' : '',
    });
  }
  if (kind === 'intervention') state.exam.interventions.push({ id, group: '', method: '', attributes: {} });
  if (kind === 'diagnosis') state.exam.diagnoses.push({ id, term: '' });
  if (kind === 'event') state.exam.events.push({ id, phase: 'intraprocedure', type: '', severity: '', outcome: '', actions: [], attributes: {} });
  state.selected = kind === 'finding' ? 'levels' : `${kind}:${id}`;
  render();
  scheduleSave();
}

function removeItem(kind, id) {
  const key = { reason: 'reasons', finding: 'findings', intervention: 'interventions', diagnosis: 'diagnoses', event: 'events' }[kind];
  let next = 'exam';
  if (kind === 'finding') {
    const finding = state.exam.findings.find((item) => item.id === id);
    next = finding && finding.organ ? `level:${finding.organ}` : 'levels';
  }
  state.exam[key] = state.exam[key].filter((item) => item.id !== id);
  state.selected = next;
  render();
  scheduleSave();
}

function ensureAttr(item, name) {
  if (!item.attributes[name]) item.attributes[name] = { value: '', detail: '' };
  return item.attributes[name];
}

function readControl(target) {
  const bind = target.dataset.bind;
  if (bind === 'narrative') {
    state.narrative = target.value;
    return 'narrative';
  }
  if (bind && bind.startsWith('demographics.')) {
    state.demographics[bind.slice('demographics.'.length)] = target.value;
    return 'demographics';
  }
  if (bind && bind.startsWith('exam.')) {
    const field = bind.slice('exam.'.length);
    state.exam[field] = target.value;
    if (field === 'procedure') {
      state.exam.extentOrgan = '';
      state.exam.extentSite = '';
    }
    if (field === 'extentOrgan') state.exam.extentSite = '';
    return 'exam';
  }
  const kind = target.dataset.kind;
  const id = target.dataset.id;
  const field = target.dataset.field;
  if (kind === 'photo') {
    const photo = state.photos.find((item) => item.id === id);
    if (photo) photo.caption = target.value;
    return 'photo';
  }
  const key = { reason: 'reasons', finding: 'findings', intervention: 'interventions', diagnosis: 'diagnoses', event: 'events' }[kind];
  const item = key ? state.exam[key].find((entry) => entry.id === id) : null;
  if (!item) return '';
  if (field === 'attr' || field === 'attrDetail') {
    const attr = ensureAttr(item, target.dataset.name);
    if (field === 'attr') attr.value = target.value;
    else attr.detail = target.value;
    return kind;
  }
  if (field === 'action') {
    const set = new Set(item.actions || []);
    if (target.checked) set.add(target.value);
    else set.delete(target.value);
    item.actions = [...set];
    return 'event';
  }
  if (field === 'method') {
    const [group, method] = target.value.split('::');
    item.group = group || '';
    item.method = method || '';
    item.attributes = {};
    return 'intervention';
  }
  item[field] = target.type === 'checkbox' ? target.checked : target.value;
  if (kind === 'finding' && field === 'statement' && item.statement === 'normal') {
    item.heading = '';
    item.term = '';
    item.modifier = '';
    item.modifierDetail = '';
    item.attributes = {};
  }
  if (kind === 'finding' && (field === 'organ' || field === 'heading') && findingMode(item) !== 'normal') {
    if (field === 'organ') item.heading = '';
    item.term = '';
    item.site = '';
    item.modifier = '';
    item.attributes = {};
  }
  if (kind === 'finding' && field === 'term') item.attributes = {};
  if (kind === 'reason' && field === 'category') {
    item.term = '';
    item.qualifier = '';
  }
  if (kind === 'event' && (field === 'phase' || field === 'type')) {
    if (field === 'phase') item.type = '';
    item.attributes = {};
    if (isNoAdverseEvent(item)) {
      item.severity = '';
      item.outcome = '';
      item.actions = [];
    }
  }
  return kind;
}

function onEdit(event) {
  const target = event.target;
  if (!target.dataset || (!target.dataset.bind && !target.dataset.kind)) return;
  const kind = readControl(target);
  const structural = target.tagName === 'SELECT' || target.type === 'checkbox' || target.dataset.bind === 'exam.procedure' || target.dataset.field === 'organ' || target.dataset.field === 'heading' || target.dataset.field === 'term' || target.dataset.field === 'statement' || target.dataset.field === 'category' || target.dataset.field === 'phase' || target.dataset.field === 'type' || target.dataset.field === 'method' || target.dataset.field === 'modifier' || target.dataset.field === 'attr' || (target.dataset.field === 'modifierDetail' && event.type === 'change');
  renderTree();
  if (structural) renderMain();
  scheduleSave();
  if (kind === 'demographics') renderTree();
}

async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = url;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function importPhotos(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    const dataUrl = await shrinkImage(file);
    state.photos.push({ id: uid(), name: file.name, caption: '', dataUrl });
  }
  render();
  scheduleSave();
}

function reportPayload() {
  return {
    demographics: state.demographics,
    exam: state.exam,
    narrative: state.narrative,
    photos: state.photos.map((photo) => ({ id: photo.id, name: photo.name, caption: photo.caption, dataUrl: photo.dataUrl })),
  };
}

function scheduleSave() {
  $('#save-state').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveLocal().catch(() => { $('#save-state').textContent = 'Could not save in this browser'; }); }, 350);
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gi-endoscopy', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('reports');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocal() {
  const payload = reportPayload();
  localStorage.setItem('gi-endo-doc-v1', JSON.stringify({ ...payload, photos: payload.photos.map(({ dataUrl, ...rest }) => rest) }));
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    tx.objectStore('reports').put(payload, 'current');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  $('#save-state').textContent = 'Saved in this browser';
}

async function loadLocal() {
  try {
    const db = await openDb();
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction('reports', 'readonly');
      const request = tx.objectStore('reports').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (stored) applyPayload(stored);
    else {
      const raw = localStorage.getItem('gi-endo-doc-v1');
      if (raw) applyPayload(JSON.parse(raw));
    }
  } catch (error) {
    const raw = localStorage.getItem('gi-endo-doc-v1');
    if (raw) applyPayload(JSON.parse(raw));
  }
}

function applyPayload(payload) {
  state.demographics = { ...emptyDemographics(), ...(payload.demographics || {}) };
  state.exam = { ...state.exam, ...(payload.exam || {}) };
  state.exam.reasons = payload.exam?.reasons || [];
  state.exam.findings = payload.exam?.findings || [];
  state.exam.interventions = payload.exam?.interventions || [];
  state.exam.diagnoses = payload.exam?.diagnoses || [];
  state.exam.events = payload.exam?.events || [];
  state.narrative = payload.narrative || '';
  state.photos = payload.photos || [];
}

function downloadReport() {
  const blob = new Blob([JSON.stringify(reportPayload(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const who = state.demographics.hospitalNumber || state.demographics.familyName || 'report';
  link.href = URL.createObjectURL(blob);
  link.download = `gi-endoscopy-${who}-${state.exam.examDate || 'undated'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function fillPrint() {
  $('#print-root').innerHTML = `<h1>Mbingo Baptist Hospital — GI Endoscopy</h1>${renderPreview().replace('<h2>Preview</h2>', '')}`;
}

function revealLevel() {
  if (!state.selected.startsWith('level:')) return;
  const organ = state.selected.slice('level:'.length);
  const node = document.getElementById(levelDomId(organ));
  if (node) node.scrollIntoView({ block: 'start' });
}

function render(options) {
  renderTree();
  renderMain();
  if (options && options.reveal) revealLevel();
}

function wire() {
  $('#tree').addEventListener('click', (event) => {
    const select = event.target.closest('[data-select]');
    const add = event.target.closest('[data-action="add"]');
    if (select) {
      state.selected = select.dataset.select;
      render({ reveal: select.dataset.select.startsWith('level:') });
    } else if (add) addItem(add.dataset.kind, add.dataset.statement);
  });
  $('#main').addEventListener('input', onEdit);
  $('#main').addEventListener('change', (event) => {
    if (event.target.id === 'photo-input') {
      importPhotos(event.target.files);
      return;
    }
    onEdit(event);
  });
  $('#main').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'set-anatomy') {
      const finding = state.exam.findings.find((item) => item.id === button.dataset.id);
      if (!finding) return;
      const field = button.dataset.field;
      const value = button.dataset.value;
      if (field !== 'site' && field !== 'modifier') return;
      finding[field] = finding[field] === value ? '' : value;
      if (field === 'modifier' && !isMeasurement(finding.modifier)) finding.modifierDetail = '';
      state.selected = finding.organ ? `level:${finding.organ}` : state.selected;
      render();
      scheduleSave();
      return;
    }
    if (button.dataset.action === 'level-status') {
      const organ = button.dataset.organ;
      const status = button.dataset.status;
      if (levelStatus(organ) === status) return;
      const detailed = findingsForOrgan(organ).some(findingHasDetail);
      if (status !== 'abnormal' && detailed) {
        const message = status === 'normal'
          ? `Mark ${organ} as no abnormality noted? Findings already entered at this level will be removed.`
          : `Clear the ${organ} documentation? Findings already entered at this level will be removed.`;
        if (!confirm(message)) return;
      }
      setLevelStatus(organ, status);
      state.selected = `level:${organ}`;
      render();
      scheduleSave();
      return;
    }
    if (button.dataset.action === 'add-finding') {
      const organ = button.dataset.organ;
      state.exam.findings = state.exam.findings.filter((finding) => !(finding.organ === organ && findingMode(finding) === 'normal'));
      state.exam.findings.push(blankFinding(organ, 'abnormal'));
      state.selected = `level:${organ}`;
      render();
      scheduleSave();
      return;
    }
    if (button.dataset.action === 'goto-level') {
      state.selected = `level:${button.dataset.organ}`;
      render({ reveal: true });
      return;
    }
    if (button.dataset.action === 'remove') removeItem(button.dataset.kind, button.dataset.id);
    if (button.dataset.action === 'remove-photo') {
      state.photos = state.photos.filter((photo) => photo.id !== button.dataset.id);
      render();
      scheduleSave();
    }
  });
  $('#btn-new').addEventListener('click', () => {
    if (!confirm('Start a new report? The current report stays saved in this browser until you overwrite it by working on the new one.')) return;
    state.selected = 'demographics';
    state.demographics = emptyDemographics();
    state.exam = { procedure: '', examDate: new Date().toISOString().slice(0, 10), endoscopist: '', extentOrgan: '', extentSite: '', reasons: [], findings: [], interventions: [], diagnoses: [], events: [] };
    state.photos = [];
    state.narrative = '';
    render();
    scheduleSave();
  });
  $('#btn-preview').addEventListener('click', () => { state.selected = 'preview'; render(); });
  $('#btn-print').addEventListener('click', () => { fillPrint(); window.print(); });
  $('#btn-download').addEventListener('click', downloadReport);
}

async function start() {
  const response = await fetch('data/dictionary.json');
  if (!response.ok) throw new Error('Could not load the MST dictionary');
  dict = await response.json();
  await loadLocal();
  wire();
  render();
  $('#save-state').textContent = localStorage.getItem('gi-endo-doc-v1') ? 'Saved in this browser' : 'Not saved yet';
}

start().catch((error) => {
  $('#main').innerHTML = `<h2>Could not open the dictionary</h2><p>${esc(error.message)}</p><p>Open this program through the local server so <code>data/dictionary.json</code> can load.</p>`;
});
