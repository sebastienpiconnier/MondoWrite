// Ouvre « Signaler un bug » : la page de GitHub préremplie (bugReport.ts), depuis À propos ou le menu Aide du Mac.

import { version } from "../package.json";
import { bugReportUrl, recentErrors, systemName } from "./bugReport";
import { getT } from "./i18n";
import { isMobileOS, isTauri, openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";

export function openBugReport() {
  const t = getT();
  const b = t.about.bug;
  const { lang, ai } = useSettings.getState();
  const { screen, kind } = useCosmos.getState();
  const url = bugReportUrl(
    {
      version,
      system: systemName(navigator.userAgent),
      shell: isTauri() ? (isMobileOS() ? b.shells.mobile : b.shells.desktop) : b.shells.browser,
      lang,
      project: screen === "home" ? "" : b.kinds[kind === "scenario" ? "scenario" : "roman"],
      ai: ai.provider ? t.ai.providers[ai.provider] : "",
      errors: recentErrors(),
    },
    b,
  );
  void openExternal(url);
}
