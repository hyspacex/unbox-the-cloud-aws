/* global KeelWidget */
"use strict";

const $ = id => document.getElementById(id);
const model = KeelWidget;
const params = new URLSearchParams(location.search);
const native = window.__TAURI__;
const shell = $("teslaWidget");
const anchor = $("widgetAnchor");
const triggers = { verified: $("boxCompliant"), review: $("boxNonCompliant"), notification: $("notificationToggle"), settings: $("btnConfig") };
let eventKey = "changed";
let preferences = { ...model.defaults };
let panel = null;
let pinned = false;
let dismissed = false;
let hovering = false;
let dragging = false;
let ignoredHover = null;
let openTimer;
let closeTimer;
let dockTimer;
let statusTimer;
let dropDepth = 0;
let lastPresentation = "";
let lastTrigger;
let connectedInfo = null;
let pendingInvitation = null;
let liveEvent = null;
let liveStale = false;
let refreshTimer;
let refreshGeneration = 0;
let refreshing = false;

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const currentEvent = () => liveEvent || model.events[eventKey];
const configuredFixture = () => preferences.folderId === model.defaults.folderId && preferences.topic === model.defaults.topic;
const dataAvailable = () => connectedInfo ? !!liveEvent : configuredFixture();

async function command(name, args = {}) {
  if (!native) return;
  try {
    return await native.core.invoke(name, args);
  } catch (error) {
    showStatus(`Desktop action failed: ${String(error)}`, false);
  }
}

function showStatus(message, temporary = true) {
  clearTimeout(statusTimer);
  $("statusMessage").textContent = message;
  $("statusMessage").hidden = false;
  if (temporary) statusTimer = setTimeout(() => { $("statusMessage").hidden = true; syncWindow(); }, 5000);
  syncWindow();
}

function rows(controls) {
  return `<div class="control-list">${controls.map(control => `<details class="control-row" id="${escape(control.id)}">
    <summary><span class="control-summary"><span class="control-title">${escape(control.title)}</span><span class="control-id">${escape(control.id)}</span></span>${icon("chevron")}</summary>
    <div class="control-content">
      <p class="control-reason">${escape(control.reason)}</p>
      <button class="source-link" data-control="${escape(control.id)}" title="${connectedInfo ? "Open source or project evidence" : "Open fixture evidence"}">${escape(control.source)} ${icon("arrow")}</button>
      ${control.author ? `<p class="control-person">Contributor &middot; ${escape(control.author)}</p>` : ""}
      ${control.verifiedBy ? `<p class="control-person">${model.isVerified(control) ? "Reviewed" : "Previously reviewed"} &middot; ${escape(control.verifiedBy)}</p>` : ""}
      ${control.snippet ? `<blockquote class="control-snippet">${escape(control.snippet)}</blockquote>` : '<p class="control-person">No inline excerpt. Open the evidence record.</p>'}
      ${control.section ? `<span class="control-person">${escape(control.section)}${connectedInfo ? "" : " / fixture excerpt"}</span>` : ""}
    </div>
  </details>`).join("")}</div>`;
}

function wireAccordions(container) {
  const rows = Array.from(container.querySelectorAll("details.control-row"));
  const hoverPreview = container !== $("detailsPage");
  for (const row of rows) {
    let timer;
    let hoverOpened = false;
    let suppressHover = false;
    const summary = row.querySelector("summary");
    const open = () => {
      for (const other of rows) if (other !== row) other.open = false;
      row.open = true;
      syncWindow();
    };
    summary.addEventListener("pointerenter", () => {
      if (!hoverPreview || suppressHover || row.open) return;
      timer = setTimeout(() => { hoverOpened = true; open(); }, 550);
    });
    summary.addEventListener("pointerleave", () => clearTimeout(timer));
    row.addEventListener("pointerleave", () => {
      clearTimeout(timer);
      suppressHover = false;
      if (hoverOpened) timer = setTimeout(() => {
        if (!row.contains(document.activeElement)) row.open = false;
        hoverOpened = false;
        syncWindow();
      }, 180);
    });
    row.addEventListener("pointerenter", () => clearTimeout(timer));
    summary.addEventListener("click", event => {
      event.preventDefault();
      clearTimeout(timer);
      hoverOpened = false;
      if (row.open) { row.open = false; suppressHover = true; }
      else open();
      syncWindow();
    });
    row.querySelector(".source-link").addEventListener("click", () => {
      const control = currentEvent().controls.find(item => item.id === row.id);
      if (connectedInfo && control?.sourceUrl && native) {
        void command("open_source", { url: control.sourceUrl });
      } else {
        void openDetails("all", row.id);
      }
    });
  }
}

function detailsAction(filter, controlId = "") {
  const button = document.createElement("button");
  button.className = "text-action";
  button.id = "openDetails";
  button.innerHTML = `View evidence ${icon("arrow")}`;
  button.addEventListener("click", () => openDetails(filter, controlId));
  return button;
}

function renderSummary() {
  const event = currentEvent();
  const count = model.counts(event);
  const available = dataAvailable();
  const mode = connectedInfo ? (liveStale ? "STALE" : liveEvent ? "LIVE" : "WAIT") : "DEMO";
  document.querySelector(".drag-label small").textContent = mode;
  document.querySelector(".demo-mark").textContent = mode;
  document.querySelector(".demo-mark").title = connectedInfo ? connectedInfo.origin : "Simulated data. No Box or AWS calls.";
  shell.classList.toggle("stale", liveStale);
  $("greenNum").textContent = available ? count.verified : "--";
  $("yellowNum").textContent = available ? count.review : "--";
  const delta = count.verified - event.beforeVerified;
  $("greenDelta").textContent = available && delta ? `${delta > 0 ? "+" : ""}${delta}` : "";
  $("yellowDelta").textContent = available && delta ? `${delta < 0 ? "+" : ""}${-delta}` : "";
  $("boxCompliant").setAttribute("aria-label", available ? `${liveStale ? "Last known: " : ""}${count.verified} verified controls. Hover for evidence; click for details.` : "Verified evidence unavailable for this project.");
  $("boxNonCompliant").setAttribute("aria-label", available ? `${liveStale ? "Last known: " : ""}${count.review} controls need review. Hover for reasons; click for details.` : "Review status unavailable for this project.");
  $("notificationSummary").textContent = "Evidence updated";
  $("notificationDelta").textContent = `${delta > 0 ? "+" : ""}${delta} verified`;
  $("notificationStrip").hidden = dismissed || !preferences.notifications || !available || liveStale;
  $("btnDock").setAttribute("aria-pressed", String(preferences.edgeAutoHide));
  shell.classList.toggle("always-chrome", !preferences.autoHideBorder);
  syncWindow();
}

function renderPanel() {
  $("detailPanel").hidden = !panel;
  shell.classList.toggle("pinned", pinned);
  for (const [kind, element] of Object.entries(triggers)) element.setAttribute("aria-expanded", String(panel === kind));
  $("btnNotifications").setAttribute("aria-expanded", String(panel === "notification"));
  $("btnDismiss").hidden = panel !== "notification";
  if (!panel) { syncWindow(); return; }

  $("panelEyebrow").textContent = connectedInfo
    ? `${liveEvent?.projectName || connectedInfo.projectId} / ${liveEvent?.snapshot || "connecting"}`
    : `Lantern / ${currentEvent().snapshot} / demo`;
  const body = $("panelBody");
  body.replaceChildren();
  if (panel === "settings") {
    renderSettings();
  } else if (panel === "connection") {
    renderInvitation();
  } else if (!dataAvailable()) {
    $("panelTitle").textContent = connectedInfo ? "Loading project" : "Not connected";
    body.innerHTML = connectedInfo
      ? '<p class="panel-copy">Waiting for an authenticated project snapshot. No demo counts are used for a connected project.</p>'
      : '<p class="panel-copy">Open a Connect link from your project page. Manually editing a folder ID does not establish a data connection.</p>';
  } else if (panel === "notification") {
    const event = currentEvent();
    const count = model.counts(event);
    $("panelTitle").textContent = event.kind === "reviewed" ? "Human review recorded" : "Evidence changed";
    body.innerHTML = `<p class="event-source"><strong>${escape(event.actor)}</strong> &middot; ${event.kind === "reviewed" ? "reviewed" : "submitted"}<code>${escape(event.file)}</code></p>
      <p class="event-impact">Verified ${event.beforeVerified} ${icon("forward")} ${count.verified}<span>&middot; ${count.review} to review</span></p>
      ${rows(event.controls.filter(control => event.affected.includes(control.id)))}
      <p class="event-note">${escape(event.note)} ${connectedInfo ? `Observed ${escape(event.time)}.` : "All activity is simulated."}</p>`;
    body.append(detailsAction("all", event.affected[0]));
  } else if (panel === "drop") {
    $("panelTitle").textContent = "Try a local drop";
    body.innerHTML = '<p class="panel-copy">Files and folders stay on this device. A drop does not upload or verify anything in this UI preview.</p>';
    for (const [label, input] of [["Choose files", "filePicker"], ["Choose a folder", "folderPicker"]]) {
      const button = document.createElement("button");
      button.className = "text-action";
      button.textContent = label;
      button.addEventListener("click", () => $(input).click());
      body.append(button);
    }
  } else {
    const verified = panel === "verified";
    const selected = currentEvent().controls.filter(control => model.isVerified(control) === verified);
    $("panelTitle").textContent = verified ? `${selected.length} verified` : `${selected.length} need review`;
    body.innerHTML = `<p class="panel-copy">${verified ? "Named human reviews still hold. Not a regulatory compliance verdict." : "These items need a human look. Missing evidence and changed bindings are different reasons."}</p>${rows(selected)}`;
    body.append(detailsAction(panel));
  }
  wireAccordions(body);
  syncWindow();
}

function openPanel(kind, pin = false, trigger = null) {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  clearTimeout(dockTimer);
  if (document.body.classList.contains("edge-hidden")) reveal();
  panel = kind;
  pinned = pin;
  if (trigger) lastTrigger = trigger;
  renderPanel();
}

function collapse(restoreFocus = false) {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  ignoredHover = panel;
  panel = null;
  pinned = false;
  renderPanel();
  if (restoreFocus && lastTrigger) lastTrigger.focus({ preventScroll: true });
  scheduleDock();
}

function preview(kind, trigger) {
  clearTimeout(closeTimer);
  clearTimeout(openTimer);
  if (pinned || ignoredHover === kind) return;
  openTimer = setTimeout(() => openPanel(kind, false, trigger), 160);
}

function scheduleClose() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  if (pinned || dragging) return;
  closeTimer = setTimeout(() => {
    if (!hovering && !shell.contains(document.activeElement)) collapse();
  }, 280);
}

function setEngaged(value) {
  hovering = value;
  shell.classList.toggle("engaged", value);
  if (value) {
    clearTimeout(closeTimer);
    clearTimeout(dockTimer);
  } else {
    ignoredHover = null;
    scheduleClose();
    scheduleDock();
  }
  syncWindow();
}

function scheduleDock() {
  clearTimeout(dockTimer);
  if (!preferences.edgeAutoHide || hovering || pinned || panel || dragging || shell.contains(document.activeElement)) return;
  dockTimer = setTimeout(async () => {
    if (hovering || pinned || panel || dragging || !preferences.edgeAutoHide) return;
    if (native) {
      const docked = await command("dock_widget");
      if (docked !== true) return;
    }
    document.body.classList.add("edge-hidden");
    $("edgeTab").hidden = false;
    lastPresentation = "";
  }, 800);
}

function reveal() {
  clearTimeout(dockTimer);
  document.body.classList.remove("edge-hidden");
  $("edgeTab").hidden = true;
  syncWindow();
}

function syncWindow() {
  if (!native || params.get("view") === "details" || document.body.classList.contains("edge-hidden")) return;
  requestAnimationFrame(() => {
    const height = Math.ceil(anchor.getBoundingClientRect().height + 12);
    const payload = JSON.stringify({ height, engaged: hovering || pinned || dragging || !!panel });
    if (payload === lastPresentation) return;
    lastPresentation = payload;
    void command("present_widget", JSON.parse(payload));
  });
}

function renderSettings() {
  $("panelEyebrow").textContent = "Keel / local settings";
  $("panelTitle").textContent = "Settings";
  $("panelBody").innerHTML = `${connectedInfo ? `<p class="panel-copy">${escape(connectedInfo.projectId)}<br>${escape(connectedInfo.origin)}</p>
    <div class="settings-actions"><button type="button" id="refreshProject">Refresh</button><button type="button" id="disconnectProject">Disconnect</button></div>` :
    '<p class="panel-copy">To connect: open your project page and choose <strong>Open in Keel</strong>.</p>'}
    <form class="settings" id="settingsForm">
    <label class="switch-row">Always on top<input id="cfgTop" type="checkbox" ${preferences.alwaysOnTop ? "checked" : ""}></label>
    <label class="switch-row">Hide border when idle<input id="cfgBorder" type="checkbox" ${preferences.autoHideBorder ? "checked" : ""}></label>
    <label class="switch-row">Tuck to screen edge<input id="cfgEdge" type="checkbox" ${preferences.edgeAutoHide ? "checked" : ""}></label>
    <label class="switch-row">Change notifications<input id="cfgNotifications" type="checkbox" ${preferences.notifications ? "checked" : ""}></label>
    <details><summary>Demo project / web details</summary>
      <label class="field">Box folder ID<input type="text" id="cfgFolder" inputmode="numeric" value="${escape(preferences.folderId)}" required></label>
      <label class="field">Topic<input type="text" id="cfgTopic" value="${escape(preferences.topic)}" required></label>
      <label class="field">Web details URL (optional)<input type="url" id="cfgWebUrl" placeholder="https://your-app.example" value="${escape(preferences.webUrl)}"></label>
      <p class="panel-copy">These fields configure the local preview. Live project settings come from an authenticated Connect link.</p>
    </details>
    <button type="submit" class="text-action">Save settings ${icon("check")}</button>
    <p class="error" id="settingsError" role="alert" hidden></p>
    <details><summary>Demo controls${connectedInfo ? " (disconnect first)" : ""}</summary><div class="settings-actions">
      <button id="demoChange" type="button">File changed</button>
      <button id="demoReview" type="button">Human reviewed</button>
    </div><button id="demoDrop" type="button" class="text-action">Try file / folder drop ${icon("upload")}</button>
    <button id="demoReset" type="button" class="text-action">Reset demo settings</button></details>
    ${native ? '<button type="button" class="text-action" id="quitWidget">Quit widget</button>' : ""}
  </form>`;
  $("settingsForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      const next = model.validatePreferences({
        folderId: $("cfgFolder").value, topic: $("cfgTopic").value, webUrl: $("cfgWebUrl").value,
        notifications: $("cfgNotifications").checked, alwaysOnTop: $("cfgTop").checked,
        autoHideBorder: $("cfgBorder").checked, edgeAutoHide: $("cfgEdge").checked
      });
      localStorage.setItem("keel.widget.preferences.v2", JSON.stringify(next));
      preferences = next;
      applyPreferences();
      collapse(true);
    } catch (error) {
      $("settingsError").textContent = `Not saved: ${error.message}`;
      $("settingsError").hidden = false;
    }
  });
  $("demoChange").addEventListener("click", () => simulate("changed"));
  $("demoReview").addEventListener("click", () => simulate("reviewed"));
  $("demoDrop").addEventListener("click", () => openPanel("drop", true, $("btnConfig")));
  $("demoReset").addEventListener("click", () => {
    try {
      localStorage.removeItem("keel.widget.preferences.v2");
      preferences = { ...model.defaults };
      eventKey = "changed"; dismissed = false;
      applyPreferences(); renderPanel();
    } catch (error) { showStatus(`Reset failed: ${error.message}`, false); }
  });
  if (native) $("quitWidget").addEventListener("click", () => command("quit_widget"));
  if (connectedInfo) {
    for (const id of ["demoChange", "demoReview", "demoReset"]) $(id).disabled = true;
    $("refreshProject").addEventListener("click", refreshProject);
    $("disconnectProject").addEventListener("click", disconnectProject);
  }
}

function applyPreferences() {
  renderSummary();
  if (native) void command("set_preferences", { alwaysOnTop: preferences.alwaysOnTop, edgeAutoHide: preferences.edgeAutoHide });
  if (!preferences.edgeAutoHide) reveal();
  scheduleDock();
}

function simulate(key) {
  if (connectedInfo) { showStatus("Disconnect the live project before using demo controls."); return; }
  eventKey = key;
  dismissed = false;
  collapse();
  renderSummary();
  if (preferences.notifications && configuredFixture()) {
    reveal();
    scheduleDock();
  }
}

async function openDetails(filter, controlId = "") {
  if (connectedInfo) {
    await command("open_project_details", { filter, controlId, snapshotId: liveEvent?.snapshot || "" });
    return;
  }
  if (!configuredFixture()) { openPanel("settings", true, $("btnConfig")); return; }
  if (params.get("view") === "details") {
    location.assign(model.detailsUrl(location.href, eventKey, filter, controlId));
    return;
  }
  if (native) {
    await command("open_details", { eventKey, filter, controlId, webUrl: preferences.webUrl });
  } else {
    const url = model.detailsUrl(preferences.webUrl || location.href, eventKey, filter, controlId);
    location.assign(url);
  }
}

function renderInvitation() {
  $("panelEyebrow").textContent = "Project connection";
  $("panelTitle").textContent = "Connect this widget?";
  if (!pendingInvitation) {
    $("panelBody").innerHTML = '<p class="panel-copy">Open a fresh Connect link from your authenticated project page.</p>';
    return;
  }
  $("panelBody").innerHTML = `<p class="panel-copy"><strong>${escape(pendingInvitation.projectId)}</strong><br>${escape(pendingInvitation.origin)}</p>
    <p class="panel-copy">Read this project's evidence status. Trust this server only if it is your team's service.</p>
    <button type="button" class="text-action" id="confirmProject">Connect ${icon("arrow")}</button>
    <button type="button" class="text-action" id="cancelProject">Cancel</button>`;
  $("confirmProject").addEventListener("click", connectInvitation);
  $("cancelProject").addEventListener("click", async () => {
    await command("decline_project");
    pendingInvitation = null;
    collapse(true);
  });
}

async function receiveInvitation(info) {
  pendingInvitation = info;
  reveal();
  let trusted = false;
  try { trusted = localStorage.getItem("keel.widget.trusted-origin") === info.origin; }
  catch (error) { showStatus(`Trusted server preference could not be read: ${error.message}`); }
  if (trusted) await connectInvitation();
  else openPanel("connection", true, $("btnConfig"));
}

async function connectInvitation() {
  if (!native || !pendingInvitation) return;
  if ($("confirmProject")) $("confirmProject").disabled = true;
  const invitation = pendingInvitation;
  try {
    const info = await native.core.invoke("connect_project");
    if (pendingInvitation !== invitation) return;
    clearInterval(refreshTimer);
    connectedInfo = info;
    pendingInvitation = null;
    liveEvent = null;
    liveStale = false;
    refreshGeneration++;
    refreshing = false;
    try { localStorage.setItem("keel.widget.trusted-origin", info.origin); }
    catch (error) { showStatus(`Connected, but server trust was not saved: ${error.message}`, false); }
    collapse();
    renderSummary();
    await refreshProject();
    refreshTimer = setInterval(refreshProject, 15000);
  } catch (error) {
    if (pendingInvitation !== invitation) return;
    pendingInvitation = null;
    renderPanel();
    showStatus(`Not connected: ${String(error)}`, false);
  }
}

async function refreshProject() {
  if (!native || !connectedInfo || refreshing) return;
  refreshing = true;
  const generation = refreshGeneration;
  const projectId = connectedInfo.projectId;
  try {
    const raw = await native.core.invoke("project_state");
    if (generation !== refreshGeneration) return;
    const next = model.validateProjectState(raw, projectId);
    if (liveEvent && next.sequence < liveEvent.sequence) throw new Error("Older project state was ignored.");
    const unchanged = liveEvent && next.sequence === liveEvent.sequence;
    if (unchanged && (next.snapshot !== liveEvent.snapshot || next.id !== liveEvent.id)) throw new Error("Inconsistent project sequence was ignored.");
    const isNew = !liveEvent || next.id !== liveEvent.id;
    liveEvent = next;
    liveStale = false;
    if (isNew) dismissed = false;
    $("statusMessage").hidden = true;
    renderSummary();
    if (!unchanged && panel && panel !== "settings" && panel !== "connection") renderPanel();
    if (isNew && preferences.notifications) { reveal(); scheduleDock(); }
  } catch (error) {
    if (generation !== refreshGeneration) return;
    liveStale = true;
    renderSummary();
    showStatus(`Refresh failed: ${String(error)}`, false);
  } finally {
    if (generation === refreshGeneration) refreshing = false;
  }
}

async function disconnectProject() {
  if (native) await command("disconnect_project");
  clearInterval(refreshTimer);
  refreshGeneration++;
  connectedInfo = null; liveEvent = null; liveStale = false; refreshing = false;
  pendingInvitation = null;
  eventKey = "changed"; dismissed = false;
  renderSummary();
  renderPanel();
}

function onLocalDrop(names) {
  dragging = false;
  dropDepth = 0;
  $("dropOverlay").hidden = true;
  if (!names.length) { showStatus("No readable drop items received."); return; }
  const firstName = String(names[0]).split(/[\\/]/).pop();
  showStatus(`${names.length} local item${names.length === 1 ? "" : "s"}: ${firstName}. Preview only; not uploaded or verified.`);
  scheduleClose();
}

function renderDetailsPage() {
  const key = params.get("event") || "changed";
  const filter = params.get("filter") || "all";
  const page = $("detailsPage");
  anchor.hidden = true;
  page.hidden = false;
  if (!Object.hasOwn(model.events, key) || !["all", "verified", "review"].includes(filter)) {
    page.innerHTML = "<h1>Unknown preview link</h1><p>The event or filter is not available.</p>";
    return;
  }
  const event = model.events[key];
  const count = model.counts(event);
  const selected = event.controls.filter(control => filter === "all" || model.isVerified(control) === (filter === "verified"));
  page.innerHTML = `<a href="widget.html" class="source-link back-link">Back to widget</a><span class="eyebrow">KEEL / DEMO / ${event.snapshot}</span><h1>Project Lantern</h1>
    <p class="panel-copy">Synthetic evidence preview. No Box, Bedrock or live approvals are connected.</p>
    <p>${count.verified} verified &middot; ${count.review} need review</p><nav class="filters" aria-label="Control filter">
    ${["all", "verified", "review"].map(value => `<a href="${escape(model.detailsUrl(location.href.split("#")[0], key, value))}" ${value === filter ? 'aria-current="page"' : ""}>${value === "review" ? "Needs review" : value[0].toUpperCase() + value.slice(1)}</a>`).join("")}</nav>
    ${rows(selected)}<p class="event-note">Reviewed and verified are evidence states, not a certification of regulatory compliance.</p>`;
  eventKey = key;
  wireAccordions(page);
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches(".control-row")) target.open = true;
  }
}

async function initialize() {
  if (params.get("view") === "details") { renderDetailsPage(); return; }
  document.body.classList.toggle("native", !!native);
  try {
    const stored = localStorage.getItem("keel.widget.preferences.v2");
    if (stored) preferences = model.validatePreferences(JSON.parse(stored));
  } catch (error) {
    showStatus(`Saved settings could not be loaded: ${error.message}. Demo defaults are in use.`, false);
  }

  shell.addEventListener("pointerenter", () => setEngaged(true));
  shell.addEventListener("pointerleave", () => setEngaged(false));
  $("detailPanel").addEventListener("pointerenter", () => { clearTimeout(closeTimer); clearTimeout(openTimer); });
  shell.addEventListener("focusin", () => { clearTimeout(closeTimer); clearTimeout(dockTimer); syncWindow(); });
  shell.addEventListener("focusout", () => queueMicrotask(() => {
    if (!shell.contains(document.activeElement)) { if (!hovering) collapse(); scheduleClose(); }
  }));
  for (const [kind, element] of Object.entries(triggers)) {
    if (kind === "settings") continue;
    element.addEventListener("pointerenter", () => preview(kind, element));
    element.addEventListener("pointerleave", () => { clearTimeout(openTimer); if (ignoredHover === kind) ignoredHover = null; });
    element.addEventListener("focus", () => { if (!pinned && ignoredHover !== kind) openPanel(kind, false, element); });
  }
  for (const [kind, element] of [["verified", $("boxCompliant")], ["review", $("boxNonCompliant")]]) {
    element.addEventListener("click", () => openDetails(kind));
  }
  for (const element of [$("notificationToggle"), $("btnNotifications")]) {
    element.addEventListener("click", () => {
      if (panel === "notification" && pinned) collapse(true);
      else { ignoredHover = null; openPanel("notification", true, element); }
    });
  }
  $("btnNotifications").addEventListener("pointerenter", () => preview("notification", $("btnNotifications")));
  $("btnConfig").addEventListener("click", () => panel === "settings" ? collapse(true) : openPanel("settings", true, $("btnConfig")));
  $("btnCollapse").addEventListener("click", () => collapse(true));
  $("btnDismiss").addEventListener("click", () => {
    dismissed = true; collapse(); renderSummary();
    ignoredHover = "notification";
    $("btnNotifications").focus({ preventScroll: true });
  });
  $("btnDock").addEventListener("click", () => {
    const next = { ...preferences, edgeAutoHide: !preferences.edgeAutoHide };
    try { localStorage.setItem("keel.widget.preferences.v2", JSON.stringify(next)); }
    catch (error) { showStatus(`Dock preference was not saved: ${error.message}`, false); return; }
    preferences = next;
    applyPreferences();
    $("btnDock").blur();
  });
  $("edgeTab").addEventListener("pointerenter", reveal);
  $("edgeTab").addEventListener("focus", reveal);
  $("edgeTab").addEventListener("click", reveal);
  document.addEventListener("pointerdown", event => { if (!anchor.contains(event.target)) collapse(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { collapse(true); $("statusMessage").hidden = true; } });
  window.addEventListener("blur", () => {
    hovering = false;
    shell.classList.remove("engaged");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    collapse();
  });
  $("dragHandle").addEventListener("pointerdown", event => {
    if (native && event.button === 0 && !event.target.closest("button")) void command("drag_widget");
  });
  for (const name of ["dragenter", "dragover", "dragleave", "drop"]) document.addEventListener(name, event => event.preventDefault());
  shell.addEventListener("dragenter", () => { dropDepth++; dragging = true; $("dropOverlay").hidden = false; clearTimeout(closeTimer); clearTimeout(dockTimer); });
  shell.addEventListener("dragleave", () => { if (--dropDepth <= 0) { dragging = false; $("dropOverlay").hidden = true; scheduleClose(); } });
  shell.addEventListener("drop", event => onLocalDrop(Array.from(event.dataTransfer.files, file => file.name)));
  for (const input of [$("filePicker"), $("folderPicker")]) input.addEventListener("change", () => { onLocalDrop(Array.from(input.files, file => file.name)); input.value = ""; });

  if (native) {
    try {
      const appWindow = native.webviewWindow.getCurrentWebviewWindow();
      await appWindow.onDragDropEvent(event => {
        if (event.payload.type === "drop") onLocalDrop(event.payload.paths);
        else {
          dragging = event.payload.type !== "leave";
          $("dropOverlay").hidden = !dragging;
          if (dragging) { reveal(); clearTimeout(closeTimer); clearTimeout(dockTimer); }
          else scheduleClose();
        }
      });
      await native.event.listen("project-invitation", event => receiveInvitation(event.payload));
      await native.event.listen("project-demo", () => disconnectProject());
      await native.event.listen("project-link-error", event => { reveal(); showStatus(event.payload, false); });
      const linkError = await native.core.invoke("take_link_error");
      if (linkError) showStatus(linkError, false);
      const invitation = await native.core.invoke("pending_project");
      if (invitation) await receiveInvitation(invitation);
      else {
        connectedInfo = await native.core.invoke("connected_project");
        if (connectedInfo) { await refreshProject(); refreshTimer = setInterval(refreshProject, 15000); }
      }
    } catch (error) { showStatus(`Desktop integration failed: ${String(error)}`, false); }
  }
  new ResizeObserver(syncWindow).observe(anchor);
  applyPreferences();
}

void initialize();
