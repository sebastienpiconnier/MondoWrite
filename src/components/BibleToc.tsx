// Sommaire de la Bible, rangé en cinq parties (bibleParts.ts) : Présentation (la couverture, les thèmes),
// Personnages, Univers, Structure, puis « Pour vous », séparée et en retrait, qui ne part jamais chez un tiers.
// Une partie qui n'a qu'une rubrique est un seul bouton ; sinon ses rubriques sont listées sous son nom.
// En mode « Choisir et ranger », on coche les rubriques et on les déplace à l'intérieur de leur partie.

import { typeColor, type CardType } from "../types";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { DEFAULT_SECTIONS, sectionOrder, toggleSection, type BibleSections } from "../bibleSections";
import { canMoveInPart, groupByPart, isPrivatePart, moveInPart, partNumber, type PartKey } from "../bibleParts";

export interface TocSection {
  type: CardType;
  count: number;
}

interface Props {
  /** Rubriques affichées, dans l'ordre des parties. */
  sections: TocSection[];
  /** Nombre de cartes de chaque type (y compris des rubriques masquées, pour le mode « ranger »). */
  counts: Map<CardType, number>;
  prefs: BibleSections;
  setPrefs: (prefs: BibleSections) => void;
  arranging: boolean;
  setArranging: (on: boolean) => void;
  onCover: boolean;
  /** Rubrique en cours, ou null sur la couverture. */
  current: CardType | null;
  openCover: () => void;
  goTo: (type: CardType) => void;
}

function PartBadge({ part }: { part: PartKey }) {
  return (
    <span className="toc-part-num" aria-hidden="true">
      {partNumber(part)}
    </span>
  );
}

export function BibleToc({ sections, counts, prefs, setPrefs, arranging, setArranging, onCover, current, openCover, goTo }: Props) {
  const { t, types } = useVocab();
  const parts = t.bible.parts;
  // La Présentation existe toujours : elle porte la couverture, même si la rubrique Thèmes est masquée.
  const groups = groupByPart(sections, (s) => s.type);
  if (!groups.some((g) => g.part === "presentation")) groups.unshift({ part: "presentation", items: [] });

  const sectionButton = (s: TocSection, sub: boolean) => {
    const isCurrent = !onCover && current === s.type;
    return (
      <button type="button" className={`${sub ? "toc-sub" : ""}${isCurrent ? " is-current" : ""}`} aria-current={isCurrent ? "true" : undefined} onClick={() => goTo(s.type)}>
        <span className="toc-label">
          <span className="card-dot" style={{ background: typeColor(s.type) }} />
          {types[s.type].section}
        </span>
        <span className="toc-count">{s.count}</span>
      </button>
    );
  };

  return (
    <nav className="bible-toc" aria-label={t.bible.tocAria}>
      <div className="eyebrow">{t.bible.tocTitle}</div>
      {arranging ? (
        <div className="toc-arrange" aria-label={t.bible.arrangeAria} role="group">
          {groupByPart(sectionOrder(prefs), (type) => type).map(({ part, items }) => (
            <div key={part} className={`toc-arrange-part${isPrivatePart(part) ? " is-private" : ""}`}>
              <div className="toc-part-head">
                <PartBadge part={part} />
                {parts[part]}
              </div>
              <ul>
                {items.map((type) => {
                  const label = types[type].section;
                  const visible = !prefs.hidden.includes(type);
                  return (
                    <li key={type}>
                      <label className="toc-check">
                        <input type="checkbox" checked={visible} onChange={() => setPrefs(toggleSection(prefs, type))} />
                        <span className="card-dot" style={{ background: typeColor(type) }} />
                        <span>{label}</span>
                        <span className="toc-count">{counts.get(type) ?? 0}</span>
                      </label>
                      <button type="button" className="icon-button" disabled={!canMoveInPart(prefs, type, "up")} aria-label={fmt(t.bible.moveUp, { section: label })} onClick={() => setPrefs(moveInPart(prefs, type, "up"))}>
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button type="button" className="icon-button" disabled={!canMoveInPart(prefs, type, "down")} aria-label={fmt(t.bible.moveDown, { section: label })} onClick={() => setPrefs(moveInPart(prefs, type, "down"))}>
                        <span aria-hidden="true">↓</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="toc-parts">
          {groups.map(({ part, items }) => {
            const single = part !== "presentation" && items.length === 1 ? items[0] : null;
            const isCurrent = single && !onCover && current === single.type;
            return (
              <li key={part} className={`toc-part${isPrivatePart(part) ? " is-private" : ""}`}>
                {single ? (
                  // Une seule rubrique : la partie est le bouton (« 2 Personnages »), sans doublon dessous.
                  <button type="button" className={`toc-part-button${isCurrent ? " is-current" : ""}`} aria-current={isCurrent ? "true" : undefined} onClick={() => goTo(single.type)}>
                    <span className="toc-label">
                      <PartBadge part={part} />
                      {parts[part]}
                    </span>
                    <span className="toc-count">{single.count}</span>
                  </button>
                ) : (
                  <>
                    <div className="toc-part-head" id={`toc-part-${part}`}>
                      <PartBadge part={part} />
                      {parts[part]}
                    </div>
                    <ul aria-labelledby={`toc-part-${part}`}>
                      {part === "presentation" && (
                        <li>
                          <button type="button" className={`toc-sub toc-cover${onCover ? " is-current" : ""}`} aria-current={onCover ? "true" : undefined} onClick={openCover}>
                            <span className="toc-label">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
                                <path d="M5 17a3 3 0 0 1 3-3h11" />
                              </svg>
                              {t.pitch.toc}
                            </span>
                          </button>
                        </li>
                      )}
                      {items.map((s) => (
                        <li key={s.type}>{sectionButton(s, true)}</li>
                      ))}
                    </ul>
                  </>
                )}
                {isPrivatePart(part) && <p className="toc-part-hint">{t.bible.privateHint}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="toc-tools">
        <button type="button" className="link-button" aria-expanded={arranging} onClick={() => setArranging(!arranging)}>
          {arranging ? t.bible.arrangeDone : t.bible.arrange}
        </button>
        {arranging && (
          <button type="button" className="link-button" onClick={() => setPrefs(DEFAULT_SECTIONS)}>
            {t.bible.arrangeReset}
          </button>
        )}
      </div>
    </nav>
  );
}
