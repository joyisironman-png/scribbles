// Scribbles widget for iPhone (runs in the free Scriptable app).
// Paste this once. The design itself updates automatically from the Scribbles site.

const MY_LINK = "PASTE-YOUR-PERSONAL-LINK-HERE";

const fm = FileManager.local();
const mod = fm.joinPath(fm.documentsDirectory(), "scribbles-widget-module.js");
const site = (MY_LINK.match(/^(https?:\/\/[^/]+)/) || [])[1];
try {
  const code = await new Request(`${site}/api/scriptable/widget?t=${Date.now()}`).loadString();
  if (code.includes("module.exports.run")) fm.writeString(mod, code);
} catch (e) {}

let w;
try {
  w = await importModule(mod).run(MY_LINK);
} catch (e) {
  w = new ListWidget();
  w.addText("Scribbles couldn't load. Check the internet.").font = Font.systemFont(12);
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
}
if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
