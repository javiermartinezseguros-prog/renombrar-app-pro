import { CompanyDefinition } from './types';

/**
 * One entry per insurance company = one "module": its detection aliases plus
 * whatever label variants and quirks make it different from the generic
 * engine (engine.ts). Four of these were checked against real sample
 * documents the user provided and are marked "REAL" below; the rest use the
 * shared generic engine as-is and are marked "GENÉRICO" — perfectly usable,
 * but their exact field labels haven't been verified yet. When one of those
 * starts misreading real files, paste the document's text and we'll turn it
 * into a calibrated entry the same way the first four were done.
 *
 * To add a new company: copy one of the "GENÉRICO" entries, rename it, and
 * fill in `aliases`. Only add `policyLabels`/`endorsementLabels`/
 * `insuredLabels`/`rubroLabels`/`customExtract` once you've actually seen
 * that company's real label wording — guessing them can make extraction
 * worse, not better.
 */
export const COMPANY_DEFINITIONS: CompanyDefinition[] = [
  // ---- REAL: calibrated against user-provided sample documents ----
  {
    id: 'san-cristobal',
    displayName: 'San Cristóbal Seguros',
    aliases: ['san cristobal', 'san cristóbal', 'sancristobal', 's.m.s.g.'],
    category: 'Generales',
    defaultRubro: 'Automotor',
    // Confirmed real fields: "TOMADOR / ASEGURADO", "N° PÓLIZA" (printed as
    // "01-05-01-32659013" — sucursal-ramo-inciso-correlativo; on Accidentes
    // Personales Colectivo policies the same label reads "N° PÓLIZA / N°
    // FACTURA:" instead, hence the permissive gap in the regex below), "RAMO",
    // "VIGENCIA DESDE/HASTA" as "00HS. del DD/MM/AAAA", and a bare "ENDOSO"
    // field whose value can be non-zero even on a page titled "Anexo de
    // Adherentes". Per the user: the number actually used as "the policy
    // number" is just the last segment after the hyphens (e.g. "32659013"),
    // not the sucursal/ramo/inciso prefix — customExtract below reproduces
    // that instead of the generic engine's default (which would keep the
    // whole hyphenated string).
    endorsementLabels: ['endoso'],
    customExtract: (text: string) => {
      const result: Record<string, string> = {};
      const normalized = text.replace(/\s+/g, ' ');

      const labeled = normalized.match(/n[°º]\s*p[oó]liza[^\d]{0,30}(\d[\d-]{5,20}\d)/i);
      // Fallback for their "Tarjeta de Circulación" layout, whose header row
      // is just a bare "PÓLIZA" (no "N°"/"Nº" prefix at all) — confirmed
      // real case where the labeled regex above never matches anything.
      // Their hyphenated sucursal-ramo-inciso-correlativo ID format is
      // distinctive enough (hardly ever coincidental) to trust wherever it
      // appears when the labeled form comes up empty.
      const bareMatch = !labeled
        ? normalized.match(/\b(\d{2}-\d{2}-\d{2}-\d{6,10}(?:-\d{1,3})?)\b/)
        : null;
      const match = labeled || bareMatch;
      if (match) {
        const segments = match[1].split('-').filter(Boolean);
        // The real policy correlativo isn't reliably the *last* segment —
        // confirmed real case: "01-05-01-32699055-1" has a trailing vehicle/
        // item sequence number after it. It IS reliably the *longest*
        // segment (the sucursal/ramo/inciso prefixes are always 2 digits,
        // any trailing sequence suffix is 1-3 digits, the correlativo itself
        // is always much longer).
        result.numeroPoliza = segments.reduce((longest, s) => (s.length > longest.length ? s : longest), segments[0]);
      }

      // Their "Tarjeta de Circulación" also prints the insured's name right
      // after that same hyphenated ID on one line ("01-05-01-32699055-1
      // VILLAN MARIA CELESTE La posesión de este comprobante..."), with no
      // real "Asegurado:" label anywhere nearby for the generic engine to
      // anchor on — the word "ASEGURADO" only appears earlier, as a bare
      // column header. Captures the all-caps run right after the ID, up to
      // the first mixed-case word (the boilerplate sentence that follows).
      const nameMatch = normalized.match(
        /\d{2}-\d{2}-\d{2}-\d{6,10}(?:-\d{1,3})?\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{3,50}?)\s+[A-Z][a-z]/
      );
      if (nameMatch) {
        result.asegurado = nameMatch[1].trim();
      } else {
        // Their bilingual Mercosur certificate has the opposite problem:
        // its header line literally spells out "ASEGURADO: NOMBRE/DIRECCION/
        // ... SEGURADO: NOMBRE/ENDERECO" as column-label text — the generic
        // engine's bare "asegurado" search grabs the word "NOMBRE" straight
        // out of that label, mistaking it for a real value. The actual name
        // is on the line right after, paired with the same policy ID.
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        const headerIdx = lines.findIndex((l) => /asegurado:\s*nombre/i.test(l));
        if (headerIdx !== -1 && lines[headerIdx + 1]) {
          const valueMatch = lines[headerIdx + 1].match(/^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ,.\s]{3,60}?)\s+\d[\d-]{5,20}\d/);
          if (valueMatch) {
            result.asegurado = valueMatch[1].trim();
          }
        }
      }

      return result;
    },
    notes:
      'REAL: Frente de Póliza + Anexo de Adherentes usa "N° PÓLIZA" completo (sucursal-ramo-inciso-correlativo), ' +
      'solo se usa el último tramo largo como número de póliza. También confirmado real: "Tarjeta de Circulación" ' +
      '(header "PÓLIZA SOCIO ASEGURADO" sin "N°", nombre pegado al ID) y certificado Mercosur bilingüe (el header ' +
      'literalmente dice "NOMBRE" como texto de columna) — ver customExtract para ambos.',
  },
  {
    id: 'mercantil-andina',
    displayName: 'Mercantil Andina Compañía de Seguros S.A.',
    // The Cuponera's own logo/branding is a background image too (verified:
    // "mercantil"/"andina" do not appear anywhere in its extractable text),
    // so detection there relies on fingerprint phrases confirmed unique to
    // their payment-coupon system instead of the company name itself.
    aliases: ['mercantil andina', 'la mercantil andina', 'pagomiscuentas', 'código de link pagos', 'codigo de link pagos'],
    category: 'Generales',
    // Confirmed real fields across Condiciones Particulares (Suplemento
    // Adicional) / Certificado de Cobertura: "POLIZA:"/"POLIZA Nº", "RAMA:"
    // or "SECCION", "ASEGURADO", "ENDOSO Nº", "VIGENCIA DE PÓLIZA" and
    // "VIGENCIA DEL SEGURO" (two bare dates, no desde/hasta words).
    //
    // The Cuponera is a different story: verified directly against the real
    // PDF (via pdf.js, both raw stream order and position-sorted) that its
    // field LABELS ("POLIZA:", "ASEGURADO:", "RAMA:", "VTO. PAGO") are baked
    // into a background image, not real text at all — no reordering or
    // label search can ever recover them. What IS real, extractable text is
    // each value, printed twice (once per side-by-side coupon column), e.g.
    // "004701119 000 01 ACCIDENTES PERSONALES (06) 004701119 000 01
    // ACCIDENTES PERSONALES (06)" and "8532568 IGARZABAL REYES ANTONIO 8532568
    // IGARZABAL REYES ANTONIO". customExtract below keys off that exact
    // duplication (a value followed by itself again) to pull out policy/
    // endoso/rubro and the insured's name without any label to anchor on;
    // it's a no-op (returns {}) on document types that do have real labels,
    // so it never overrides the generic engine's normal results there.
    customExtract: (text: string) => {
      const result: Record<string, string> = {};

      // Certificado de Cobertura layout: also confirmed to have NO real
      // label text at all (its "Certificado de Cobertura Nº"/"SECCION"/
      // "POLIZA Nº" titles are baked into the header graphic same as the
      // Cuponera's) — but unlike the Cuponera, values here aren't duplicated
      // either. What's reliable instead is the fixed line order the
      // generator always uses: "Pag. 00X", certificado number, rubro,
      // "{policyDigits} {endosoDigits}", solicitud number, a date range,
      // then the insured's name — recovered here positionally.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (/^pag\.?\s*\d+/i.test(lines[0] || '')) {
        const policyLine = lines[3] || '';
        const policyMatch = policyLine.match(/^(\d{6,10})\s+(\d{1,4})$/);
        if (policyMatch) {
          result.numeroPoliza = policyMatch[1];
          result.numeroEndoso = policyMatch[2];
          result.rubro = lines[2] || '';
          result.tipoDocumento = 'Cobertura';
        }
        const dateLine = lines[5] || '';
        const dateMatch = dateLine.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}\.\d{1,2}\.\d{4})/);
        if (dateMatch) {
          result.vigenciaDesde = dateMatch[1];
          result.vigenciaHasta = dateMatch[2];
        }
        const nameLine = lines[6] || '';
        if (/^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ,.\s]{3,50}$/.test(nameLine)) {
          result.asegurado = nameLine;
        }
        if (result.numeroPoliza) return result;
      }

      // Suplemento Adicional layout: mostly has real "N° PÓLIZA"-style labels
      // (handled generically), EXCEPT for this one recurring phrase — "Según
      // se detalla..." / "Suplemento Adicional 01 - Poliza 004397064 /
      // 00016" — which never carries a colon or "N°" marker, so none of the
      // generic policy labels match it. Confirmed real and specific enough
      // (requires the full "Suplemento Adicional NN - Poliza" phrase) to be
      // a safe fallback when nothing else already found the policy number.
      const suplementoMatch = text
        .replace(/\s+/g, ' ')
        .match(/suplemento\s+adicional\s+\d+\s*-\s*p[oó]liza\s+(\d{6,10})/i);
      if (suplementoMatch) {
        result.numeroPoliza = suplementoMatch[1];
      }

      // Cuponera layout: no real labels either, but every value is printed
      // twice (once per side-by-side coupon column) — that duplication is
      // what lets us find policy/rubro/endorsement and the insured's name/id
      // reliably without a label to anchor on. It also IS the tipoDocumento
      // signal for this company: every payment-related keyword tried (plan
      // de pago, pagomiscuentas, código de link pagos) turned out to also
      // appear in Mercantil Andina's Frente de Póliza/Suplemento documents,
      // which repeat a generic "how to pay" section — but only a real coupon
      // has this exact duplication.
      const normalized = text.replace(/\s+/g, ' ');
      const policyMatch = normalized.match(
        /\b(\d{6,10})\s+(\d{2,4})\s+(\d{1,2})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{3,40}?)(?:\s*\(\d+\))?\s+\1\b/
      );
      if (policyMatch) {
        result.numeroPoliza = policyMatch[1];
        result.numeroEndoso = policyMatch[3];
        result.rubro = policyMatch[4].trim();
        result.tipoDocumento = 'Cuponera';
      }

      // Usually the "ID NAME" pair repeats immediately (ID NAME ID NAME). But
      // when the header/value column-pairing upstream joins this coupon's
      // rows with "Label: Value" text in between (confirmed real case:
      // "9929571 FERRARI DIEGO HERNAN: 12 De Octubre 736... | 9929571
      // FERRARI DIEGO HERNAN: 14.08.2026"), the two occurrences are no longer
      // adjacent — only reliably still bounded by a colon right after the
      // name both times. Try the strict adjacent form first, then fall back
      // to the colon-bounded, non-adjacent form.
      const nameMatch =
        normalized.match(/\b(\d{5,9})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ,\s]{3,45}?)\s+\1\s+\2\b/) ||
        normalized.match(/\b(\d{5,9})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ,\s]{3,45}?)\s*:[\s\S]{0,120}?\1\s+\2\s*:/);
      if (nameMatch) {
        result.asegurado = nameMatch[2].trim();
      }

      const dateRangeMatch = normalized.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
      if (dateRangeMatch) {
        result.vigenciaDesde = dateRangeMatch[1];
        result.vigenciaHasta = dateRangeMatch[2];
      }

      return result;
    },
    notes:
      'REAL: Suplemento Adicional (=Endoso) tiene etiquetas de texto reales. ' +
      'Certificado de Cobertura y Cuponera NO tienen etiquetas reales (quemadas en imagen) — ' +
      'se extrae por duplicación estructural de valores, ver customExtract.',
  },
  {
    id: 'integrity',
    displayName: 'Integrity Seguros Argentina S.A.',
    // "intergity" (missing the second 'i') is a confirmed real typo baked
    // into their own Cuponera generator — that document type never spells
    // the company name correctly, so without this alias it goes undetected.
    aliases: ['integrity', 'intégrity', 'intergity'],
    category: 'Generales',
    defaultRubro: 'Accidentes Personales',
    // Confirmed real fields on their "Constancia de Cobertura": "RAZÓN
    // SOCIAL DEL TOMADOR", "Póliza N°", "Certificado N°", "Fecha Inicio/Fin
    // de Vigencia", and "PRODUCTO" (their equivalent of "rubro" — NOT
    // labeled "Ramo" here, unlike most other insurers).
    rubroLabels: ['producto'],
    customExtract: (text: string) => {
      const result: Record<string, string> = {};

      // Constancia de Cobertura: "RAZÓN SOCIAL DEL TOMADOR" and "C.U.I.T /
      // Doc. N°" are two side-by-side header cells. The generic
      // header/value row-pairing usually joins them fine ("RAZÓN SOCIAL DEL
      // TOMADOR: NAME | C.U.I.T / Doc. N°: CUIT"), but confirmed real case
      // where a shorter/longer name shifts the CUIT column just past the
      // alignment tolerance, leaving the header and its value as two
      // unpaired lines instead — and the generic engine then grabs "C.U.I.T"
      // itself as if it were the insured's name. Handles both shapes
      // directly instead of trusting the generic pairing for this field.
      const joinedMatch = text.match(/raz[oó]n\s+social\s+del\s+tomador:\s*([^|\n]+?)\s*\|/i);
      if (joinedMatch) {
        result.asegurado = joinedMatch[1].trim();
      } else {
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        const headerIdx = lines.findIndex((l) => /raz[oó]n\s+social\s+del\s+tomador/i.test(l));
        if (headerIdx !== -1 && lines[headerIdx + 1]) {
          const valueMatch = lines[headerIdx + 1].match(/^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ,.\s]{3,60}?)\s+\d{7,11}\s*$/);
          if (valueMatch) {
            result.asegurado = valueMatch[1].trim();
          }
        }
      }

      // Cuponera: like Mercantil Andina's, its field labels are baked into a
      // background image — no real "Póliza"/"Asegurado" text at all. What IS
      // real, extractable text: a 14-digit code (2-digit sección + 12-digit
      // póliza, per their own "indicar los 14 dígitos de sección y póliza"
      // instructions) repeated once per coupon column, and the insured's
      // name embedded in a repeated "Vigencia: del NAME (2) (1) ..." phrase.
      //
      // Gated on "código de pago" — confirmed real phrase unique to this
      // coupon layout ("Código de pago electrónico:", "Código de pago Red
      // Link:") — because a bare 14-digit run isn't safe to assume is the
      // policy code anywhere else: confirmed real bug where this matched
      // "CAE Nº: 86350730870280" (an unrelated AFIP tax authorization
      // number, also 14 digits) on a normal "Frente de Póliza" and silently
      // overwrote the correct, already-labeled "Póliza: 000000139030" the
      // generic engine had found.
      if (/c[oó]digo de pago/i.test(text)) {
        const codeMatch = text.match(/\b\d{2}(\d{12})\b/);
        if (codeMatch) {
          result.numeroPoliza = codeMatch[1];
        }
        const nameMatch = text.match(/vigencia:\s*del\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{3,50}?)\s*(?:\(|\d|$)/i);
        if (nameMatch) {
          result.asegurado = nameMatch[1].trim();
        }
      }

      return result;
    },
    notes:
      'REAL: Constancia de Cobertura usa "PRODUCTO" en vez de "Ramo"; Frente de Póliza usa "Endoso:" a secas ' +
      '(sin "N°"). Cuponera no tiene etiquetas reales (quemadas en imagen) y su generador escribe el nombre de ' +
      'la compañía mal ("Intergity") — ver customExtract y el alias adicional arriba.',
  },
  {
    id: 'atm-seguros',
    displayName: 'ATM Compañía de Seguros S.A.',
    // "el importe será debitado de cbu" is a confirmed-real fingerprint
    // phrase, not company branding — needed because their newer "Tarjeta de
    // Circulación" template (see the bare-ID fallback in customExtract
    // below) bakes literally every label, including the company name, into
    // a background image. pdf.js's text layer for that layout comes back
    // with exactly 14 bare value strings and zero "ATM" text anywhere, so
    // alias matching would otherwise fail on it completely — same problem,
    // and same fix, as Mercantil Andina's cuponera below.
    aliases: ['atm seguros', 'atm compañía de seguros', 'el importe será debitado de cbu'],
    category: 'Generales',
    defaultRubro: 'Automotor',
    // Confirmed real fields on their (older) tarjeta de circulación: "Asegurado:",
    // "Vehiculo:", "Patente:", "Póliza Nro." (format "03 - 01102551"),
    // "Vigencia desde X al Y". Their "Liquidación de Premio / Frente de
    // Póliza" layout is a different real format: a "SECCIÓN PÓLIZA Nº
    // ENDOSO Nº VIGENCIA" table header, whose value row sits several lines
    // below it with an unrelated "FC N°: {invoice number}" line interposed
    // in between — the generic 60-char-window search after the header label
    // grabs that invoice number instead, since it's the first number it
    // finds. Confirmed real, unambiguous fallback: this layout always
    // restates the real numbers plainly further down as "PÓLIZA: 1708892 /
    // 0" (policy / endoso), which is what this pulls from directly instead
    // of trusting the generic header-search for this field on this layout.
    customExtract: (text: string) => {
      const result: Record<string, string> = {};
      const match = text.match(/p[oó]liza:\s*(\d+)\s*\/\s*(\d+)/i);
      if (match) {
        result.numeroPoliza = match[1];
        result.numeroEndoso = match[2];
        return result;
      }

      // Confirmed real, second "Liquidación de Premio / Frente de Póliza"
      // variant (a renewal/"Copia de Póliza Original"): this one never
      // restates "PÓLIZA: NNN / NN" at all, so the fallback above finds
      // nothing. Its "SECCIÓN PÓLIZA Nº ENDOSO Nº VIGENCIA" table header is
      // real, but the value row directly below it is just the VIGENCIA
      // column's own wrapped "Desde las 12:00:00 Hs. del DD/MM/AAAA" line —
      // the real "<RUBRO> <póliza> <endoso>" row (e.g. "MOTOVEHICULOS
      // 6571033 0") sits one line further down than that. Without this, the
      // generic header-search grabs "12" (out of "12:00:00") for BOTH
      // numeroPoliza and numeroEndoso — confirmed real, produces an
      // identical, silently wrong "12"/"12" pair instead of "6571033"/"0".
      const tableMatch = text.match(
        /secci[oó]n\s+p[oó]liza\s+n[°º]\s+endoso\s+n[°º]\s+vigencia[\s\S]{0,80}?\n\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,30}\s+(\d{4,10})\s+(\d{1,3})\s*\n/i
      );
      if (tableMatch) {
        result.numeroPoliza = tableMatch[1];
        result.numeroEndoso = tableMatch[2];
        return result;
      }

      // Confirmed real: their newer "Tarjeta de Circulación" template (see
      // the alias note above) has no field labels at all in its text layer,
      // so the generic engine finds nothing here either. The only reliable
      // anchor is its bare "<sucursal> - <póliza>" pair (e.g. "04 -
      // 06571033"); it never prints an endoso number on this layout (the
      // app's own "00" default applies, same as San Cristóbal's tarjeta).
      // tipoDocumento is set directly here too, since neither the filename
      // nor the text contain any of the usual "tarjeta de circulación"/
      // "tarjeta de rc" keywords for the generic classifier to go on.
      const bareMatch = text.match(/\b(\d{2})\s*-\s*(\d{5,10})\b/);
      if (bareMatch) {
        result.numeroPoliza = bareMatch[2];
        result.tipoDocumento = 'Tarjeta de RC';
        // The insured's name is the very next line after the bare ID on
        // this layout too (confirmed real, same positioning San Cristóbal's
        // own tarjeta uses) — no label anywhere nearby for the generic
        // engine's insuredLabels search to anchor on at all.
        const nameMatch = text.match(
          /\b\d{2}\s*-\s*\d{5,10}\b\s*\n\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{3,40})\s*\n/
        );
        if (nameMatch) {
          result.asegurado = nameMatch[1].trim();
        }
      }
      return result;
    },
    notes:
      'REAL: Tarjeta de Circulación / RC verificada (dos variantes: una con labels de texto reales, y una ' +
      'más nueva con todos los labels — incluida la marca ATM — horneados en una imagen de fondo, ver ' +
      'alias y customExtract). También confirmado real: Liquidación de Premio / Frente de Póliza (dos ' +
      'variantes: una que restituye "PÓLIZA: NNN / NN" más abajo, y una — la de renovación — que no lo ' +
      'hace y hay que leer directo de la fila de la tabla "SECCIÓN PÓLIZA Nº ENDOSO Nº VIGENCIA", ver ' +
      'customExtract).',
  },

  {
    id: 'federacion-patronal',
    displayName: 'Federación Patronal Seguros S.A.',
    aliases: ['federacion patronal', 'federación patronal', 'fedpat'],
    category: 'Generales',
    insuredLabels: ['nombre y apellido'],
    // Confirmed real bug on their "Aviso de Emisión / Endoso Cualitativo"
    // layout: the header row "... CLIENTE NRO. POLIZA Nro. ENDOSO
    // CERTIFICADO" sits one row above its values, but an unrelated "AVISO DE
    // EMISION" date printed just above ends up vertically close enough to
    // get pulled into that same value row, leaving it with one extra leading
    // token — so the header/value cell counts never line up (mismatch is a
    // header-short-by-one, the opposite direction the generic column-pairing
    // fallback in pdfText.ts handles) and the generic label search then
    // grabs the nearest number after "POLIZA Nro." at all, which turns out
    // to be that unrelated leaked date bridged into one fake numeric ID
    // (confirmed real case: numeroPoliza came out "19092025" from the date
    // "19-09-2025"). The real POLIZA Nro./ENDOSO/CERTIFICADO values are
    // always the last three pure-digit tokens right before CLIENTE NRO.'s
    // own value in that row — pulled here directly by position instead of
    // trusting the generic header-pairing for this specific row shape.
    customExtract: (text: string) => {
      const normalized = text.replace(/\s+/g, ' ');
      const match = normalized.match(
        /cliente\s+nro\.?\s+p[oó]liza\s+nro\.?\s+endoso\s+certificado\b[\s\S]{0,120}?\b(\d{5,10})\b\s+\b(\d{5,10})\b\s+\b(\d{1,3})\b\s+\b(\d{1,3})\b/i
      );
      if (!match) return {};
      // Groups in column order: CLIENTE NRO., POLIZA Nro., ENDOSO, CERTIFICADO.
      return { numeroPoliza: match[2], numeroEndoso: match[3] };
    },
    notes:
      'REAL: Aviso de Emisión / Endoso Cualitativo — "Nombre y Apellido" es la etiqueta del asegurado; ' +
      'la fila CLIENTE NRO./POLIZA Nro./ENDOSO/CERTIFICADO se recupera por posición (ver customExtract) ' +
      'porque una fecha de emisión cercana descuadra el conteo de columnas del emparejador genérico.',
  },
  // ---- GENÉRICO: usan el motor compartido tal cual, sin muestras reales todavía ----
  {
    id: 'la-segunda',
    displayName: 'La Segunda Cooperativa Limitada de Seguros Generales',
    aliases: ['la segunda'],
    category: 'Generales',
  },
  {
    id: 'allianz',
    displayName: 'Allianz Argentina Compañía de Seguros S.A.',
    aliases: ['allianz'],
    category: 'Generales',
  },
  {
    id: 'sancor-seguros',
    displayName: 'Sancor Seguros',
    aliases: ['sancor'],
    category: 'Generales',
  },
  {
    id: 'zurich',
    displayName: 'Zurich Argentina Compañía de Seguros S.A.',
    aliases: ['zurich'],
    category: 'Generales',
  },
  {
    id: 'mapfre',
    displayName: 'Mapfre Argentina Seguros S.A.',
    aliases: ['mapfre'],
    category: 'Generales',
  },
  {
    id: 'rivadavia',
    displayName: 'Rivadavia Seguros',
    aliases: ['rivadavia'],
    category: 'Generales',
  },
  {
    id: 'berkley',
    displayName: 'Berkley International Seguros',
    aliases: ['berkley'],
    category: 'Generales',
  },
  {
    id: 'rio-uruguay',
    displayName: 'Río Uruguay Seguros',
    aliases: ['rio uruguay', 'río uruguay', 'rus seguros'],
    category: 'Generales',
  },
  {
    id: 'smg-seguros',
    displayName: 'SMG Seguros',
    aliases: ['smg seguros', 'swiss medical seguros'],
    category: 'Generales',
  },
  {
    id: 'provincia-seguros',
    displayName: 'Provincia Seguros',
    aliases: ['provincia seguros'],
    category: 'Generales',
  },
  {
    id: 'bbva-seguros',
    displayName: 'BBVA Seguros',
    // Bare 'consolidar' removed — confirmed real bug: it's an ordinary
    // Spanish verb ("para consolidar su cobertura...") that detectCompany's
    // plain substring match could hit in any unrelated insurer's boilerplate
    // text, misclassifying the whole document. 'consolidar seguros' (the
    // full brand phrase) is specific enough to keep.
    aliases: ['bbva seguros', 'consolidar seguros'],
    category: 'Generales',
  },
  {
    id: 'galicia-seguros',
    displayName: 'Galicia Seguros',
    aliases: ['galicia seguros'],
    category: 'Generales',
  },
  {
    id: 'nacion-seguros',
    displayName: 'Nación Seguros',
    aliases: ['nacion seguros', 'nación seguros'],
    category: 'Generales',
  },
  {
    id: 'hdi-seguros',
    displayName: 'HDI Seguros',
    aliases: ['hdi seguros'],
    category: 'Generales',
  },
  {
    id: 'triunfo-seguros',
    displayName: 'Triunfo Seguros',
    aliases: ['triunfo seguros'],
    category: 'Generales',
  },
  {
    id: 'experta-seguros',
    displayName: 'Experta Seguros',
    aliases: ['experta seguros'],
    category: 'Generales',
  },
  {
    id: 'holando-sudamericana',
    displayName: 'Holando Sudamericana Compañía de Seguros',
    aliases: ['holando'],
    category: 'Generales',
  },
  {
    id: 'caruso-seguros',
    displayName: 'Caruso Compañía Argentina de Seguros S.A.',
    aliases: ['caruso'],
    category: 'Generales',
  },
  {
    id: 'libra-seguros',
    displayName: 'Libra Compañía Argentina de Seguros S.A.',
    aliases: ['libra seguros'],
    category: 'Generales',
  },
  {
    id: 'asociart-art',
    displayName: 'Asociart ART S.A.',
    aliases: ['asociart'],
    category: 'ART',
    defaultRubro: 'Riesgos del Trabajo',
  },
  {
    id: 'prevencion-art',
    displayName: 'Prevención ART S.A.',
    aliases: ['prevencion art', 'prevención art'],
    category: 'ART',
    defaultRubro: 'Riesgos del Trabajo',
  },
  {
    id: 'chubb',
    displayName: 'Chubb Seguros Argentina S.A.',
    aliases: ['chubb'],
    category: 'Generales',
  },
  {
    id: 'testimonio-seguros',
    displayName: 'Testimonio Compañía de Seguros',
    aliases: ['testimonio seguros', 'testimonio compañía de seguros'],
    category: 'Generales',
  },
  {
    id: 'parana-seguros',
    displayName: 'Paraná Seguros',
    aliases: ['parana seguros', 'paraná seguros'],
    category: 'Generales',
  },
];
