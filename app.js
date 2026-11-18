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

function emptyExam() {
  return {
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
  };
}

function normalizeExam(exam) {
  const next = { ...emptyExam(), ...(exam || {}) };
  next.reasons = exam?.reasons || [];
  next.findings = exam?.findings || [];
  next.interventions = exam?.interventions || [];
  next.diagnoses = exam?.diagnoses || [];
  next.events = exam?.events || [];
  return next;
}

function blankReport() {
  return { id: uid(), exam: emptyExam(), photos: [], narrative: '' };
}

function blankPatient() {
  return { id: uid(), demographics: emptyDemographics(), reports: [blankReport()] };
}

const store = {
  selected: '',
  patients: [],
  patientId: '',
  reportId: '',
  treeOpen: {},
};

function currentPatient() {
  return store.patients.find((item) => item.id === store.patientId) || store.patients[0];
}

function currentReport() {
  const patient = currentPatient();
  return patient.reports.find((item) => item.id === store.reportId) || patient.reports[0];
}

function patientName(patient) {
  const d = patient.demographics;
  return [d.givenName, d.familyName].filter(Boolean).join(' ') || d.hospitalNumber || 'New patient';
}

function hasIdentity(patient) {
  const d = patient.demographics || {};
  return [d.givenName, d.familyName, d.hospitalNumber].some((value) => (value || '').trim());
}

function reportHasClinicalContent(report) {
  const exam = report.exam || {};
  return Boolean(
    exam.procedure ||
    (exam.endoscopist || '').trim() ||
    (exam.extentOrgan || '').trim() ||
    (report.narrative || '').trim() ||
    (report.photos || []).length ||
    (exam.reasons || []).length ||
    (exam.findings || []).length ||
    (exam.interventions || []).length ||
    (exam.diagnoses || []).length ||
    (exam.events || []).length
  );
}

function patientIsListed(patient) {
  return hasIdentity(patient) || patient.reports.some(reportHasClinicalContent);
}

function reportLabel(report) {
  const proc = dict && dict.procedures.find((item) => item.id === report.exam.procedure);
  return [report.exam.examDate, proc ? proc.label : 'Procedure not chosen'].filter(Boolean).join(' · ');
}

const state = {
  get selected() { return store.selected; },
  set selected(value) { store.selected = value; },
  get demographics() { return currentPatient().demographics; },
  set demographics(value) { currentPatient().demographics = value; },
  get exam() { return currentReport().exam; },
  set exam(value) { currentReport().exam = value; },
  get photos() { return currentReport().photos; },
  set photos(value) { currentReport().photos = value; },
  get narrative() { return currentReport().narrative; },
  set narrative(value) { currentReport().narrative = value; },
};

let dict = null;
let saveTimer = null;

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
(function seedWorkspace() {
  const patient = blankPatient();
  store.patients = [patient];
  store.patientId = patient.id;
  store.reportId = patient.reports[0].id;
}());
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
    <p class="lede">Register the patient once. Each procedure report for this patient uses this same record.</p>
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
    <p class="lede">This is one procedure for ${esc(patientName(currentPatient()))}. Choose the procedure, then document each level in order — esophagus, stomach, and duodenum.</p>
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
    ${currentPatient().reports.length > 1 ? '<div class="row-actions"><button type="button" class="btn btn-danger" data-action="remove-report">Remove this procedure</button></div>' : ''}`;
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

function renderLevel(organ) {
  const organs = levelOrder();
  if (!procedure() || !organs.includes(organ)) return '';
  const status = levelStatus(organ);
  const abnormal = findingsForOrgan(organ).filter((finding) => findingMode(finding) !== 'normal');
  let body = `${renderAnatomyCatalog(organ)}<p class="hint">Mark this level, then choose the site and modifier.</p>`;
  if (status === 'normal') body = renderNormalLevel(organ);
  if (status === 'abnormal') {
    body = abnormal.map((finding, findingIndex) => renderAbnormalFinding(finding, findingIndex)).join('')
      + `<button type="button" class="btn btn-secondary" data-action="add-finding" data-organ="${esc(organ)}">+ Add finding</button>`;
  }
  const clearLevel = status !== 'empty'
    ? `<div class="row-actions"><button type="button" class="btn btn-danger" data-action="level-status" data-organ="${esc(organ)}" data-status="empty">Remove</button></div>`
    : '';
  return `
    <section class="level is-active" id="${levelDomId(organ)}">
      <header class="level-head">
        <div class="level-index">${organs.indexOf(organ) + 1}</div>
        <div>
          <h3>${esc(organ)}</h3>
          ${statusButtons(organ, status)}
        </div>
      </header>
      <div class="level-body">${body}${clearLevel}</div>
    </section>`;
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

const NO_ADVERSE_EVENT = 'No adverse events';

function isNoAdverseEvent(item) {
  return item.type === NO_ADVERSE_EVENT || item.type === 'No adverse events during the procedure';
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

function reportNarrativeField() {
  return `<div class="field wide"><label>Report narrative</label>
      <textarea data-bind="narrative" placeholder="Additional description, impression, or recommendations">${esc(state.narrative)}</textarea>
    </div>`;
}

function renderNarrative() {
  return `
    <h2>Free text</h2>
    <p class="lede">Narrative at the end of the report. The structured tree above is kept as well.</p>
    ${reportNarrativeField()}`;
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

function isReportSelection(key) {
  if (!key || key === 'demographics' || key === 'preview') return false;
  const reportKeys = ['exam', 'images', 'narrative'];
  return reportKeys.includes(key) || key.includes(':');
}

function renderMain() {
  const main = $('#main');
  const scroll = main.scrollTop;
  const key = state.selected;
  if (isReportSelection(key) && !isTreeSectionOpen('procedure-doc')) {
    main.innerHTML = '';
    return;
  }
  let html = '';
  if (!key) html = '';
  else if (key === 'demographics') html = renderDemographics();
  else if (key === 'exam') html = renderExam().replace('data-bind="exam.procedure">', 'data-bind="exam.procedure">').replace(/<option value="(EGD|Enteroscopy|VCE|Colonoscopy|ERCP|EUS)">[^<]*<\/option>/g, (all, id) => {
    const item = dict.procedures.find((entry) => entry.id === id);
    return item ? `<option value="${item.id}"${state.exam.procedure === item.id ? ' selected' : ''}>${esc(item.label)}</option>` : all;
  });
  else if (key === 'images') html = renderImages();
  else if (key === 'narrative') html = renderNarrative();
  else if (key === 'preview') html = renderPreview();
  else if (key.startsWith('level:')) html = renderLevel(key.slice('level:'.length));
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

function isTreeSectionOpen(key) {
  if (store.treeOpen[key] === undefined) store.treeOpen[key] = !key.includes('-');
  return !!store.treeOpen[key];
}

function syncTreeSections() {
  const sel = state.selected || '';
  const ensure = (key) => { store.treeOpen[key] = true; };
  if (sel === 'demographics') ensure('patient');
  const reportKeys = ['exam', 'images', 'narrative', 'preview'];
  if (reportKeys.includes(sel) || (sel.includes(':') && !sel.startsWith('open'))) ensure('procedures');
  if (sel.startsWith('reason:')) ensure('report-reasons');
  if (sel.startsWith('level:')) ensure('report-levels');
  if (sel.startsWith('intervention:')) ensure('report-interventions');
  if (sel.startsWith('diagnosis:')) ensure('report-diagnoses');
  if (sel.startsWith('event:')) ensure('report-events');
}

function treeCollapsible(sectionKey, title, sub, body, nested) {
  const open = isTreeSectionOpen(sectionKey);
  const wrapClass = nested ? 'tree-section tree-section-nested' : 'tree-section';
  const subHtml = sub ? `<small>${esc(sub)}</small>` : '';
  return `<div class="${wrapClass}">
    <button type="button" class="tree-section-head" data-action="toggle-section" data-section="${esc(sectionKey)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="tree-section-title"><strong>${esc(title)}</strong>${subHtml}</span>
      <span class="tree-chevron" aria-hidden="true"></span>
    </button>
    <div class="tree-section-panel"${open ? '' : ' hidden'}>${body}</div>
  </div>`;
}

function listCount(n, none, one, many) {
  if (!n) return none;
  return n === 1 ? one : many.replace('{n}', String(n));
}

function renderTree() {
  syncTreeSections();
  const proc = procedure();
  const reasonLabel = (item) => item.term || item.category || 'New reason';
  const interventionLabel = (item) => item.method || 'New intervention';
  const diagnosisLabel = (item) => item.term || 'New diagnosis';
  const eventLabel = (item) => item.type || 'New adverse event';
  const levels = proc ? levelOrder() : [];
  const levelHint = UPPER_LEVELS.every((name) => levels.includes(name)) ? 'Esophagus, stomach, duodenum' : 'In procedure order';
  const levelNav = levels.length
    ? levels.map((organ, index) => treeButton(`level:${organ}`, `${index + 1}. ${organ}`, levelSummary(organ), 'tree-level')).join('')
    : '';
  const patient = currentPatient();
  const report = currentReport();
  const docOpen = isTreeSectionOpen('procedure-doc');
  const reportItems = docOpen ? patient.reports.filter((item) => item.id === report.id) : patient.reports;
  const reports = reportItems.map((item) => `<button type="button" class="tree-item${item.id === report.id ? ' active' : ''}" data-action="open-report" data-id="${item.id}"><span>${esc(reportLabel(item))}</span></button>`).join('');
  const allProcedures = docOpen && patient.reports.length > 1
    ? '<button type="button" class="tree-add" data-action="show-all-procedures">All procedures</button>'
    : '';
  const name = patientName(patient);
  const demo = patient.demographics || {};
  const patientHeader = name === 'New patient' ? 'New patient' : name;
  const patientSub = demo.hospitalNumber || (name === 'New patient' ? 'Not registered yet' : 'Current patient');
  const reasons = state.exam.reasons.length;
  const interventions = state.exam.interventions.length;
  const diagnoses = state.exam.diagnoses.length;
  const events = state.exam.events.length;
  const reportBody = [
    treeCollapsible('report-reasons', 'Indications', listCount(reasons, 'None yet', '1 entered', '{n} entered'), treeItems('reason', state.exam.reasons, reasonLabel, 'reason'), true),
    levels.length ? treeCollapsible('report-levels', 'Levels', levelHint, levelNav, true) : '',
    treeCollapsible('report-interventions', 'Interventions', listCount(interventions, 'None yet', '1 recorded', '{n} recorded'), treeItems('intervention', state.exam.interventions, interventionLabel, 'intervention'), true),
    treeCollapsible('report-diagnoses', 'Diagnoses', listCount(diagnoses, 'None yet', '1 entered', '{n} entered'), treeItems('diagnosis', state.exam.diagnoses, diagnosisLabel, 'diagnosis'), true),
    treeCollapsible('report-events', 'Adverse events', listCount(events, 'None yet', '1 entered', '{n} entered'), treeItems('event', state.exam.events, eventLabel, 'adverse event'), true),
    treeButton('images', 'Images', state.photos.length ? `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'}` : 'Import photos'),
    treeButton('narrative', 'Free text', state.narrative ? 'Narrative entered' : 'End of report'),
  ].join('');
  const procSub = listCount(patient.reports.length, 'No procedures yet', '1 procedure', '{n} procedures');
  const procedureDoc = docOpen ? `<div class="tree-procedure-doc">${reportBody}</div>` : '';
  const procHeadSub = docOpen ? reportLabel(report) : procSub;
  $('#tree').innerHTML = [
    treeCollapsible('patient', patientHeader, patientSub, treeButton('demographics', 'Demographics', name === 'New patient' ? 'Register this patient' : 'Patient registration')),
    treeCollapsible('procedures', 'Procedures', procHeadSub, `${reports}${allProcedures}${procedureDoc}`),
  ].join('');
}

function showAllProcedures() {
  store.treeOpen['procedure-doc'] = false;
  store.treeOpen.procedures = true;
  state.selected = '';
  render();
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
  state.selected = kind === 'finding' ? '' : `${kind}:${id}`;
  render();
  scheduleSave();
}

function removeItem(kind, id) {
  const key = { reason: 'reasons', finding: 'findings', intervention: 'interventions', diagnosis: 'diagnoses', event: 'events' }[kind];
  let next = 'exam';
  if (kind === 'finding') {
    const finding = state.exam.findings.find((item) => item.id === id);
    next = finding && finding.organ ? `level:${finding.organ}` : '';
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
  const field = target.dataset.field;
  const structural = target.tagName === 'SELECT'
    || target.type === 'checkbox'
    || target.dataset.bind === 'exam.procedure'
    || field === 'organ'
    || field === 'heading'
    || field === 'term'
    || field === 'statement'
    || field === 'category'
    || field === 'phase'
    || field === 'type'
    || field === 'method'
    || field === 'modifier'
    || (field === 'attr' && target.tagName === 'SELECT')
    || (field === 'modifierDetail' && event.type === 'change');
  renderTree();
  if (structural) renderMain();
  else if (field === 'attr' && event.type === 'change') renderMain();
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
    version: 2,
    patientId: store.patientId,
    reportId: store.reportId,
    patients: store.patients.map((patient) => ({
      id: patient.id,
      demographics: patient.demographics,
      reports: patient.reports.map((report) => ({
        id: report.id,
        exam: report.exam,
        narrative: report.narrative,
        photos: report.photos.map((photo) => ({ id: photo.id, name: photo.name, caption: photo.caption, dataUrl: photo.dataUrl })),
      })),
    })),
  };
}

function payloadWithoutPhotoData(payload) {
  return {
    ...payload,
    patients: payload.patients.map((patient) => ({
      ...patient,
      reports: patient.reports.map((report) => ({
        ...report,
        photos: report.photos.map(({ dataUrl, ...rest }) => rest),
      })),
    })),
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
  localStorage.setItem('gi-endo-doc-v2', JSON.stringify(payloadWithoutPhotoData(payload)));
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
    else applyStoredText();
  } catch (error) {
    applyStoredText();
  }
}

function applyStoredText() {
  const raw = localStorage.getItem('gi-endo-doc-v2') || localStorage.getItem('gi-endo-doc-v1');
  if (raw) applyPayload(JSON.parse(raw));
}

function applyPayload(payload) {
  if (!payload) return;
  if (Array.isArray(payload.patients)) {
    store.patients = payload.patients.map((patient) => ({
      id: patient.id || uid(),
      demographics: { ...emptyDemographics(), ...(patient.demographics || {}) },
      reports: (patient.reports && patient.reports.length ? patient.reports : [blankReport()]).map((report) => ({
        id: report.id || uid(),
        exam: normalizeExam(report.exam),
        narrative: report.narrative || '',
        photos: report.photos || [],
      })),
    }));
  } else {
    store.patients = [{
      id: uid(),
      demographics: { ...emptyDemographics(), ...(payload.demographics || {}) },
      reports: [{
        id: uid(),
        exam: normalizeExam(payload.exam),
        narrative: payload.narrative || '',
        photos: payload.photos || [],
      }],
    }];
  }
  if (!store.patients.length) store.patients = [blankPatient()];
  store.patientId = store.patients.some((item) => item.id === payload.patientId) ? payload.patientId : store.patients[0].id;
  const patient = currentPatient();
  store.reportId = patient.reports.some((item) => item.id === payload.reportId) ? payload.reportId : patient.reports[0].id;
}

function downloadReport() {
  const note = {
    demographics: state.demographics,
    exam: state.exam,
    narrative: state.narrative,
    photos: state.photos,
  };
  const blob = new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const who = state.demographics.hospitalNumber || state.demographics.familyName || 'report';
  const proc = procedure();
  link.href = URL.createObjectURL(blob);
  link.download = `gi-endoscopy-${who}-${state.exam.examDate || 'undated'}${proc ? `-${proc.id}` : ''}.json`;
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

function sectionTitle() {
  const key = state.selected || '';
  if (key === 'demographics') return 'Demographics';
  if (key === 'exam') return 'Examination';
  if (key === 'images') return 'Images';
  if (key === 'narrative') return 'Free text';
  if (key === 'preview') return 'Preview';
  if (key.startsWith('level:')) return key.slice('level:'.length);
  if (key.startsWith('reason:')) return 'Indication';
  if (key.startsWith('intervention:')) return 'Intervention';
  if (key.startsWith('diagnosis:')) return 'Diagnosis';
  if (key.startsWith('event:')) return 'Adverse event';
  return 'GI Endoscopy';
}

function patientLookupText(patient) {
  const d = patient.demographics || {};
  return [patientName(patient), d.hospitalNumber, d.givenName, d.middleName, d.familyName, d.telephone, d.nationalId]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function renderPatientPickerList() {
  const list = $('#patient-picker-list');
  const empty = $('#patient-picker-empty');
  if (!list) return;
  const query = ($('#patient-picker-search')?.value || '').trim().toLowerCase();
  const current = currentPatient();
  const visible = store.patients.filter(patientIsListed);
  const filtered = query ? visible.filter((item) => patientLookupText(item).includes(query)) : visible;
  if (!filtered.length) {
    list.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.textContent = visible.length ? 'No matching patients' : 'No patients registered yet';
    }
    return;
  }
  if (empty) empty.hidden = true;
  list.innerHTML = filtered.map((item) => {
    const d = item.demographics || {};
    const sub = d.hospitalNumber || d.telephone || '';
    const active = item.id === current.id ? ' is-current' : '';
    return `<li><button type="button" class="patient-picker-item${active}" data-action="select-patient" data-id="${item.id}"><strong>${esc(patientName(item))}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</button></li>`;
  }).join('');
}

function openPatientPicker() {
  setActions(false);
  const picker = $('#patient-picker');
  if (!picker) return;
  const search = $('#patient-picker-search');
  if (search) search.value = '';
  renderPatientPickerList();
  picker.hidden = false;
  search?.focus();
}

function closePatientPicker() {
  const picker = $('#patient-picker');
  if (picker) picker.hidden = true;
}

function refreshPatientPicker() {
  const picker = $('#patient-picker');
  if (picker && !picker.hidden) renderPatientPickerList();
}

function render(options) {
  renderTree();
  renderMain();
  refreshPatientPicker();
  const title = $('#page-title');
  if (title) title.textContent = sectionTitle();
  if (options && options.reveal) revealLevel();
}

const MENU_PIN_KEY = 'gi-endo-menu-pinned';
let menuPinned = false;

function readMenuPinned() {
  try { return localStorage.getItem(MENU_PIN_KEY) === '1'; }
  catch { return false; }
}

function applyMenuLayout() {
  const workspace = document.querySelector('.workspace');
  const pin = $('#btn-pin-menu');
  if (workspace) workspace.classList.toggle('menu-pinned', menuPinned);
  if (!pin) return;
  pin.setAttribute('aria-pressed', menuPinned ? 'true' : 'false');
  const label = menuPinned ? 'Unpin menu' : 'Pin menu to the left';
  pin.title = label;
  pin.setAttribute('aria-label', label);
}

function setMenu(open) {
  const layer = $('#menu-layer');
  const button = $('#btn-menu');
  if (!layer || !button) return;
  const show = menuPinned || open;
  layer.hidden = !show;
  button.setAttribute('aria-expanded', show ? 'true' : 'false');
}

function setMenuPinned(pinned) {
  menuPinned = !!pinned;
  try { localStorage.setItem(MENU_PIN_KEY, menuPinned ? '1' : '0'); }
  catch { /* keep the choice for this visit */ }
  applyMenuLayout();
  setMenu(true);
}

function setActions(open) {
  const menu = $('#actions-menu');
  const button = $('#btn-actions');
  if (!menu || !button) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function goHome() {
  setMenu(false);
  setActions(false);
  state.selected = 'demographics';
  render();
}

function addPatient() {
  const draft = store.patients.find((item) => !patientIsListed(item));
  const patient = draft || blankPatient();
  if (!draft) store.patients.push(patient);
  store.patientId = patient.id;
  store.reportId = patient.reports[0].id;
  state.selected = 'demographics';
  render();
  scheduleSave();
}

function addReport() {
  const report = blankReport();
  currentPatient().reports.push(report);
  store.reportId = report.id;
  state.selected = 'exam';
  store.treeOpen.procedures = true;
  store.treeOpen['procedure-doc'] = true;
  render();
  scheduleSave();
}

function openPatient(id) {
  const patient = store.patients.find((item) => item.id === id);
  if (!patient || !patient.reports.length) return;
  store.patientId = patient.id;
  if (!patient.reports.some((item) => item.id === store.reportId)) {
    store.reportId = patient.reports[patient.reports.length - 1].id;
  }
  store.treeOpen['procedure-doc'] = false;
  state.selected = 'demographics';
  render();
}

function openReport(id) {
  if (!currentPatient().reports.some((item) => item.id === id)) return;
  store.reportId = id;
  state.selected = 'exam';
  store.treeOpen.procedures = true;
  store.treeOpen['procedure-doc'] = true;
  render();
}

function removeReport() {
  const patient = currentPatient();
  if (patient.reports.length < 2) return;
  const label = reportLabel(currentReport());
  if (!confirm(`Remove ${label}? The patient registration stays.`)) return;
  const removed = store.reportId;
  patient.reports = patient.reports.filter((item) => item.id !== removed);
  store.reportId = patient.reports[0].id;
  state.selected = '';
  render();
  scheduleSave();
}

function wire() {
  $('#tree').addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    const select = event.target.closest('[data-select]');
    if (action && action.dataset.action === 'open-patient') { setMenu(false); openPatient(action.dataset.id); return; }
    if (action && action.dataset.action === 'open-report') { setMenu(false); openReport(action.dataset.id); return; }
    if (action && action.dataset.action === 'show-all-procedures') { showAllProcedures(); return; }
    if (action && action.dataset.action === 'toggle-section') {
      const key = action.dataset.section;
      store.treeOpen[key] = !isTreeSectionOpen(key);
      renderTree();
      return;
    }
    if (select) {
      state.selected = select.dataset.select;
      setMenu(false);
      render({ reveal: select.dataset.select.startsWith('level:') });
    } else if (action && action.dataset.action === 'add') {
      setMenu(false);
      addItem(action.dataset.kind, action.dataset.statement);
    } else if (action) setMenu(false);
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
    if (button.dataset.action === 'remove-report') removeReport();
  });
  $('#patient-picker').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-action="select-patient"]');
    if (pick) {
      closePatientPicker();
      openPatient(pick.dataset.id);
      return;
    }
    if (event.target.id === 'patient-picker-backdrop' || event.target.id === 'patient-picker-close') closePatientPicker();
  });
  $('#patient-picker-search').addEventListener('input', () => renderPatientPickerList());
  $('#btn-select-patient').addEventListener('click', () => openPatientPicker());
  $('#btn-new').addEventListener('click', () => { setActions(false); addPatient(); });
  $('#btn-procedure').addEventListener('click', () => { setActions(false); addReport(); });
  $('#btn-preview').addEventListener('click', () => { setActions(false); state.selected = 'preview'; render(); });
  $('#btn-print').addEventListener('click', () => { setActions(false); fillPrint(); window.print(); });
  $('#btn-download').addEventListener('click', () => { setActions(false); downloadReport(); });
  $('#btn-menu').addEventListener('click', () => {
    setActions(false);
    if (menuPinned) return;
    setMenu($('#menu-layer').hidden);
  });
  $('#btn-pin-menu').addEventListener('click', () => {
    setActions(false);
    setMenuPinned(!menuPinned);
  });
  $('#menu-backdrop').addEventListener('click', () => setMenu(false));
  $('#btn-back').addEventListener('click', goHome);
  $('#btn-brand').addEventListener('click', goHome);
  $('#btn-actions').addEventListener('click', (event) => {
    event.stopPropagation();
    setMenu(false);
    setActions($('#actions-menu').hidden);
  });
  document.addEventListener('click', (event) => {
    if (!$('#actions-menu').hidden && !event.target.closest('.emr-actions')) setActions(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMenu(false);
      setActions(false);
      closePatientPicker();
    }
  });
}

let wired = false;

async function start() {
  if (!dict) {
    const response = await fetch('data/dictionary.json');
    if (!response.ok) throw new Error('Could not load the MST dictionary');
    dict = await response.json();
    await loadLocal();
  }
  if (!wired) {
    wire();
    wired = true;
  }
  menuPinned = readMenuPinned();
  applyMenuLayout();
  if (menuPinned) setMenu(true);
  render();
  $('#save-state').textContent = (localStorage.getItem('gi-endo-doc-v2') || localStorage.getItem('gi-endo-doc-v1')) ? 'Saved in this browser' : 'Not saved yet';
}

// Accounts for this documentation app. They are not Mbingo EMR user accounts.
const SESSION_KEY = 'gi-endo-session';
const ACCOUNTS = [
  { username: 'endoscopy', passwordHash: 'd4c710917825f34ff351d4848ed84cedf03d911ad77a59a0cd4a680e08a7de14' },
];

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

function showLogin() {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
}

async function passwordHash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function credentialsMatch(username, password) {
  const hash = await passwordHash(password);
  const name = username.trim().toLowerCase();
  return ACCOUNTS.some((account) => account.username === name && account.passwordHash === hash);
}

let clockStarted = false;

function startClock() {
  if (clockStarted) return;
  clockStarted = true;
  const tick = () => {
    const clock = $('#emr-clock');
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  tick();
  setInterval(tick, 30000);
}

async function enterApp() {
  const session = readSession();
  if (!session) return showLogin();
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  $('#session-label').textContent = `Welcome: ${session.username}`;
  startClock();
  try {
    await start();
  } catch (error) {
    $('#main').innerHTML = `<h2>Could not open the dictionary</h2><p>${esc(error.message)}</p><p>Open this program through the local server so <code>data/dictionary.json</code> can load.</p>`;
  }
}

async function attemptLogin(event) {
  event.preventDefault();
  const username = $('#login-user').value.trim();
  const password = $('#login-pass').value;
  const location = $('#login-location').value;
  const error = $('#login-error');
  if (!username || !password || !location) {
    error.textContent = 'Enter your username, password, and location.';
    error.hidden = false;
    return;
  }
  if (!(await credentialsMatch(username, password))) {
    error.textContent = 'Invalid username or password. Please try again.';
    error.hidden = false;
    $('#login-pass').value = '';
    $('#login-pass').focus();
    return;
  }
  error.hidden = true;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: username.toLowerCase(), location }));
  $('#login-pass').value = '';
  await enterApp();
}

async function signOut() {
  if (dict) {
    clearTimeout(saveTimer);
    try { await saveLocal(); } catch { /* the last successful save remains */ }
  }
  sessionStorage.removeItem(SESSION_KEY);
  $('#login-user').value = '';
  $('#login-pass').value = '';
  $('#login-error').hidden = true;
  showLogin();
  $('#login-user').focus();
}

$('#login-form').addEventListener('submit', (event) => {
  attemptLogin(event).catch(() => {
    const error = $('#login-error');
    error.textContent = 'Could not check the sign-in. Reload the page and try again.';
    error.hidden = false;
  });
});
$('#btn-signout').addEventListener('click', () => { signOut(); });

if (readSession()) enterApp();
else {
  showLogin();
  $('#login-user').focus();
}
