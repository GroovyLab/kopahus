import { SAFETY } from '../lib/score'
import type { Meta, PriceArea, SafetyClass } from '../lib/types'

export default function Methodology({ meta, prices, onClose }: { meta: Meta; prices: Record<string, PriceArea>; onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="x modal-x" onClick={onClose} aria-label="Stäng">
          ×
        </button>
        <h2>Källor & metod</h2>
        <p className="muted">
          Data byggd {meta.built}. Allt bygger på officiell statistik och öppna data, och inga siffror är påhittade. Där något är en
          uppskattning (restider, pris för en viss boyta) står det.
        </p>

        <h3>Trygghetsklassning</h3>
        <p>
          Varje DeSO-område (SCB:s minsta statistikområde, ca 700–2 700 invånare) får en klass. Polisens officiella klassning går
          alltid först. Därefter används SCB:s och Delmos socioekonomiska områdestyp, som bygger på andel med låg ekonomisk standard,
          låg utbildning och långvarigt bistånd eller arbetslöshet.
        </p>
        <ul className="method-list">
          {(['sarskilt', 'utsatt', 'granslage', 'blandat', 'bra', 'bast'] as SafetyClass[]).map((c) => (
            <li key={c}>
              <i style={{ background: SAFETY[c].color }} />
              <b>{SAFETY[c].short}</b> {SAFETY[c].desc}
            </li>
          ))}
        </ul>
        <p className="muted small">
          Polisens gränser är exakta polygoner från deras öppna data (lägesbild 2025, gränser 2025-12-01). Ett DeSO räknas som utsatt
          om minst 20 % av ytan ligger inom Polisens område. Kartans streckade linjer visar Polisens exakta gränser.
        </p>

        <h3>Matchning</h3>
        <p>
          Varje faktor räknas om till 0–100 och vägs ihop med era vikter. Trygghet fungerar dessutom som tak när den har vikt 3 eller
          mer: särskilt utsatta områden kan få högst 15, utsatta högst 30 och områden på gränsen högst 60, oavsett pris och läge.
        </p>

        <h3>Priser</h3>
        <p>
          Svensk Mäklarstatistik bygger på faktiska slutpriser som mäklarna rapporterar (senast uppdaterad{' '}
          {prices.stockholm?.updated}). För Stockholms stad finns 13 prisområden och för övriga kommuner kommunsnitt. Pris för er boyta
          räknas som kr/m² × boyta. Villapriser är kommunens medelpris. Booli och Hemnet har inga öppna API:er, så varje gata och område har
          länkar som söker fram deras slutprissidor.
        </p>

        <h3>Restider</h3>
        <p>
          Ett eget nätverk över tunnelbana, pendeltåg, Tvärbanan, Roslagsbanan, Saltsjöbanan, Lidingöbanan, spårvagn och
          Mälartåg till Uppsala (linjedata från OpenStreetMap). Tid mellan stationer räknas från avstånd och typisk hastighet, och
          modellen är kalibrerad mot SL:s tidtabeller (t.ex. T-Centralen–Vällingby 25 min och Stockholm C–Uppsala 55 min, inklusive
          väntan). Gång räknas med 4,8 km/h, och längre än 1,3 km antas anslutningsbuss. Busslinjer ingår inte i övrigt, så
          restiderna är ungefärliga (±5–10 min).
        </p>

        <h3>Källor</h3>
        <ul className="sources">
          {Object.entries(meta.sources).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
        <p className="muted small">
          Baskarta © OpenMapTiles © OpenStreetMap-bidragsgivare via OpenFreeMap. Adressökning via Nominatim (OpenStreetMap).
        </p>
      </div>
    </div>
  )
}
