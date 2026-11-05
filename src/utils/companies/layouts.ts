import { DocumentType } from '../../types';
import { RuleExtractionResult } from './types';

/**
 * Layout rules per company, written from what ~7,000 real PDFs of the archive
 * actually look like (informes-reglas-renombrar\INFORME_REGLAS_POR_COMPANIA.md).
 *
 * They run AFTER the company's own `customExtract` and override it field by
 * field: each rule only returns the fields its layout can state with
 * certainty, so a layout that does not match changes nothing.
 */

// `current` is what the generic pass and the company's own rules already found: a
// rule meant only as a fallback must not replace a value that was already right.
type Layout = (text: string, fileName: string, current: Partial<RuleExtractionResult>) => Partial<RuleExtractionResult>;

const U = 'A-ZÁÉÍÓÚÑÜ';
// A person's or company's name in capitals: "PEREZ, JUAN CARLOS", "MUSTAQE INDUMENTARIA SA".
const NAME = `[${U}][${U} ,.']{2,60}?`;

const endosoType = (endoso: number): DocumentType => (endoso > 0 ? 'Endoso' : 'Póliza');

// ---------------------------------------------------------------- Mercantil Andina
const mercantilAndina: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};

  // Frente de póliza / endoso, page 1: three lines in a fixed order —
  // "003912882 000001" (policy + 6-digit endoso), the validity dates, the name.
  const front = text.match(
    new RegExp(
      `^\\s*(\\d{9})\\s+(\\d{6})\\s*\\n\\s*(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s*\\n\\s*(${NAME})\\s*$`,
      'm'
    )
  );
  if (front) {
    const endoso = parseInt(front[2], 10);
    r.numeroPoliza = front[1];
    r.numeroEndoso = String(endoso);
    r.vigenciaDesde = front[3];
    r.vigenciaHasta = front[4];
    r.asegurado = front[5].trim();
    r.tipoDocumento = endosoType(endoso);
    const rubro = text.match(
      /^\s*(ACCIDENTES PERSONALES|AUTOMOTORES|MOTOVEHICULOS|INTEGRAL[^\n]*|COMBINADO[^\n]*|RESPONSABILIDAD CIVIL[^\n]*|INCENDIO[^\n]*)\s*\n\s*\d{9}\s+\d{6}/im
    );
    if (rubro) r.rubro = rubro[1].trim();
    return r;
  }

  // Certificate, second layout: "014919812 0010 Pag. 1" (policy + 4-digit endoso),
  // later "02.01.2025 - 02.02.2025" and the name under it.
  const certB = text.match(
    new RegExp(`^\\s*(\\d{9})\\s+(\\d{4})\\s+Pag\\.?\\s*\\d+\\s*$[\\s\\S]{0,80}?(\\d{2}\\.\\d{2}\\.\\d{4})\\s*-\\s*(\\d{2}\\.\\d{2}\\.\\d{4})\\s*\\n\\s*(${NAME})\\s*$`, 'm')
  );
  if (certB) {
    r.numeroPoliza = certB[1];
    r.numeroEndoso = String(parseInt(certB[2], 10));
    r.vigenciaDesde = certB[3];
    r.vigenciaHasta = certB[4];
    r.asegurado = certB[5].trim();
    r.tipoDocumento = 'Cobertura';
    return r;
  }

  // The supplement header always carries "Poliza 003912882/00001": the digits
  // after the slash are the real endoso. "Suplemento Adicional 01" is only
  // the number of this printout, NOT the endoso (it read "01" on everything).
  const supplement = text.match(/suplemento\s+adicional\s+\d+\s*-\s*p[oó]liza\s+(\d{9})\s*\/\s*(\d{5})/i);
  if (supplement) {
    const endoso = parseInt(supplement[2], 10);
    r.numeroPoliza = supplement[1];
    r.numeroEndoso = String(endoso);
    r.tipoDocumento = endosoType(endoso);
  }

  const flat = text.replace(/\s+/g, ' ');

  // Cuponera, first layout: "004016880 000 01 ACCIDENTES PERSONALES (06)" =
  // policy, ENDOSO (000) and instalment number (01, 02...). The old rule took
  // the instalment number as the endoso.
  const couponA = flat.match(new RegExp(`\\b(\\d{6,10}) (\\d{3}) (\\d{1,2}) (${NAME}) \\(\\d+\\) \\1 `));
  if (couponA) {
    r.numeroPoliza = couponA[1];
    r.numeroEndoso = String(parseInt(couponA[2], 10));
    r.tipoDocumento = 'Cuponera';
  }

  // Cuponera, second layout: no endoso at all; the insured is "8765868 NAME:".
  const couponB = flat.match(new RegExp(`\\b(\\d{9}) (${NAME}) \\((\\d{1,3})\\) \\1 `));
  if (couponB) {
    r.numeroPoliza = couponB[1];
    r.numeroEndoso = '0';
    r.rubro = couponB[2].trim();
    r.tipoDocumento = 'Cuponera';
    const holder = flat.match(new RegExp(`\\b\\d{5,9} (${NAME}):`));
    if (holder) r.asegurado = holder[1].trim();
  }

  // Older certificate printed from Mendoza: "CERTIFICADO/SOLICITUD/POLIZA Nº: 63593389",
  // and the name on the line under the "ASEGURADO" heading.
  const old = /Necochea 183/.test(text) && text.match(/(?:CERTIFICADO\/SOLICITUD\/)?POLIZA\s*N[º°]:\s*(\d{5,10})/i);
  if (old) {
    r.numeroPoliza = old[1];
    r.tipoDocumento = 'Cobertura';
    const holder = text.match(new RegExp(`ASEGURADO[^\\n]*\\n\\s*([${U}]+,\\s[${U} ]+?)\\s+(?:[a-z]\\)|DNI|$)`, 'm'));
    if (holder) r.asegurado = holder[1].trim();
  }
  return r;
};

// ---------------------------------------------------------------- Gestión + Digna (same platform)
const gestionDigna: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};

  // "TOMADOR POLIZA Nº [ENDOSO Nº] FEC. EMISION LUGAR" and, under it,
  // "APELLIDO, NOMBRE 23.586 0 18/07/2023 C.A.B.A." — the policy is written
  // with dots as thousand separators. No ENDOSO column = a coverage certificate.
  const row = text.match(
    new RegExp(
      `TOMADOR\\s+POLIZA\\s+N[º°]\\s+(ENDOSO\\s+N[º°]\\s+)?FEC\\.?\\s*EMISION\\s+LUGAR\\s*\\n\\s*(${NAME})\\s+([\\d.,]+)\\s+(?:(\\d{1,3})\\s+)?(\\d{2}/\\d{2}/\\d{4})`,
      'i'
    )
  );
  if (row) {
    r.asegurado = row[2].replace(/,/g, '').replace(/\s+/g, ' ').trim();
    // thousand separators: dots, or commas when the PDF's text layer is garbled ("3,072")
    r.numeroPoliza = row[3].replace(/[.,]/g, '');
    if (row[1]) {
      r.numeroEndoso = row[4];
      r.tipoDocumento = endosoType(parseInt(row[4], 10));
    } else {
      // No ENDOSO column: a certificate. The document type is left to the
      // generic title check — a 25-page policy bundle whose first page is a
      // "Certificado grupal de cobertura" is filed by the user as the policy.
      r.numeroEndoso = '0';
    }
    return r;
  }

  // "Certificado de cobertura individual" (Digna): under "TOMADOR / ASEGURADO POLIZA Nº VIGENCIA"
  // come "NOMBRE Desde (*) Hasta las 24 hs." and, on its own line, the policy number.
  const individual = text.match(
    new RegExp(`TOMADOR\\s*\\/\\s*ASEGURADO\\s+POLIZA\\s+N[º°]\\s+VIGENCIA\\s*\\n\\s*(${NAME})\\s+Desde[^\\n]*\\n\\s*([\\d.]{3,9})\\s*\\n`, 'i')
  );
  if (individual) {
    r.asegurado = individual[1].replace(/,/g, '').replace(/\s+/g, ' ').trim();
    r.numeroPoliza = individual[2].replace(/\./g, '');
    r.numeroEndoso = '0';
    return r;
  }
  // "Anexo de póliza": "SECCIÓN PÓLIZA Nº ENDOSO Nº VIGENCIA" and, under it,
  // "11 - Accidentes Personales Individual 29.421 0".
  const annex = text.match(
    /SECCI[OÓ]N\s+P[OÓ]LIZA\s+N[º°]\s+ENDOSO\s+N[º°]\s+VIGENCIA[\s\S]{0,80}?\n\s*\d{1,2}\s*-\s*[^\n]*?\s([\d.]{3,9})\s+(\d{1,3})\s*\n/i
  );
  if (annex) {
    r.numeroPoliza = annex[1].replace(/\./g, '');
    r.numeroEndoso = annex[2];
    return r;
  }
  // "Constancia de alta de asegurados": no policy number yet ("Póliza N°: XXXXXX"); the client is
  // "APELLIDOS: PEREZ" + "NOMBRES: LOPEZ BRIAN DANIEL", on two lines.
  const surnames = text.match(new RegExp(`APELLIDOS:\\s*(${NAME})\\s+ENDOSO[^\\n]*\\n\\s*NOMBRES:\\s*(${NAME})\\s+\\d{2}/\\d{2}/\\d{4}`, 'i'));
  if (surnames) {
    r.asegurado = `${surnames[1].trim()} ${surnames[2].trim()}`;
    return r;
  }
  // Cuponera: the "Nº Cuota / Fecha Vto. / Secc. / Póliza / Endo." row, e.g.
  // "1 22/08/2023 12 23765 0". The name sits under "Asegurado", between lone
  // letters that are the coupon's vertical lettering ("I: D NOMBRE | M: P ...",
  // or "D NOMBRE 30.519.489 P ..." on Digna's, right before the DNI).
  const coupon = text.match(
    /N[º°]\s*Cuota\s+Fecha\s+Vto\.?\s+Secc\.?\s+P[oó]liza\s+Endo\.?[\s\S]{0,60}?\b\d{1,3}\s+\d{2}\/\d{2}\/\d{4}\s+(\d{1,2})\s+(\d{1,9})\s+(\d{1,3})\b/i
  );
  if (coupon) {
    r.numeroPoliza = coupon[2];
    r.numeroEndoso = coupon[3];
    r.tipoDocumento = 'Cuponera';
    const holder = text.match(
      new RegExp(`^(?:[A-Z]:\\s*)?[A-Z]\\s+([${U}]{2,}(?: [${U}]{2,}){1,4})\\s*(?:\\||\\d{1,2}\\.\\d{3}\\.\\d{3})`, 'm')
    );
    if (holder) r.asegurado = holder[1];
  }
  return r;
};

// ---------------------------------------------------------------- San Cristóbal
const sanCristobal: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // Certificado individual de incorporación (AP colectivo): the client is the TOMADOR.
  const holder = /certificado individual/i.test(text) && text.match(/\btomador:\s*([^|\n]+?)\s*\|/i);
  if (holder) r.asegurado = holder[1].trim();
  // Cuponera: "RAMO: ... | SOCIO: LOPEZ MARCELINO | RAMO: ..."
  const partner = /nro cup[oó]n/i.test(text) && text.match(/\bsocio:\s*([^|\n]+?)\s*\|/i);
  if (partner) r.asegurado = partner[1].trim();
  // Nota de crédito: "NOMBRE AUTOMOTORES 01-05-01-32134389 900" under "... NOTA DE CREDITO N° ENDOSO".
  const credit = text.match(
    new RegExp(
      `n[oó]ta de credito[^\\n]*\\n\\s*(${NAME})\\s+(?:AUTOMOTORES|ACCIDENTES PERSONALES|MOTOVEHICULOS|INTEGRAL[A-Z ]*)\\s+(\\d{2}-\\d{2}-\\d{2}-\\d{6,10})\\s+(\\d+)`,
      'i'
    )
  );
  if (credit) {
    r.asegurado = credit[1].trim();
    r.numeroPoliza = credit[2].split('-').reduce((longest, part) => (part.length > longest.length ? part : longest));
    r.numeroEndoso = credit[3];
  }
  return r;
};

// ---------------------------------------------------------------- Federación Patronal
const federacionPatronal: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // "Póliza: 9-579432-0" = ramo - número - endoso. The generic pass glued the
  // three together ("95794320").
  const dashed = text.match(/p[oó]lizas?:\s*(\d{1,2})-(\d{4,9})-(\d{1,3})\b/i);
  // "PAGO CONSOLIDADO": the header "SECCIÓN AUTOMOTORES PÓLIZA 35712687" names the
  // main policy; the "* Póliza: 4-35712687-0" lines below list ALL the client's
  // policies (a "VIDA MODULAR" one can come first), so the header decides.
  const consolidated = text.match(/secci[oó]n\s+[A-ZÁÉÍÓÚÑ .]+?\s+p[oó]liza\s+(\d{4,9})\b/i);
  if (consolidated) {
    r.numeroPoliza = consolidated[1];
    const own = text.match(new RegExp(`p[oó]liza:\\s*\\d{1,2}-${consolidated[1]}-(\\d{1,3})\\b`, 'i'));
    const endoso = own ? parseInt(own[1], 10) : 0;
    r.numeroEndoso = String(endoso);
    if (/pago consolidado/i.test(text)) r.tipoDocumento = endosoType(endoso);
  } else if (dashed) {
    r.numeroPoliza = dashed[2];
    r.numeroEndoso = dashed[3];
  }
  // "Aviso de emisión productor": the row under "DESDE HASTA TERMINO CLIENTE NRO. POLIZA Nro. ENDOSO"
  // reads "30-10-2026 30-10-2026 04-10-2027 339 Dias 5018718 10784909 3" (the generic pass took the date).
  const notice = text.match(
    /TERMINO\s+CLIENTE\s+NRO\.?\s+POLIZA\s+Nro\.?\s+ENDOSO[^\n]*\n[^\n]*?\d+\s+D[ií]as\s+(\d{4,10})\s+(\d{4,10})\s+(\d{1,3})\b/i
  );
  if (notice) {
    r.numeroPoliza = notice[2];
    r.numeroEndoso = notice[3];
    r.tipoDocumento = endosoType(parseInt(notice[3], 10));
  }
  // Tarjeta de RC: "Póliza 32864803 / 0" and "Cliente: 4870135 NOMBRE ("
  const card = text.match(/\bp[oó]liza\s+(\d{5,9})\s*\/\s*(\d{1,3})\b/i);
  if (card && !dashed && !consolidated) {
    r.numeroPoliza = card[1];
    r.numeroEndoso = card[2];
  }
  const client = text.match(new RegExp(`cliente:\\s*\\d+\\s+(${NAME})\\s*(?:\\(|$)`, 'im'));
  if (client) r.asegurado = client[1].trim();
  // Certificado de cobertura, older printing: "PÓLIZA: 10370365" and, under
  // "DATOS DEL TOMADOR/CONTRATANTE:", "FLOSI LUIS OMAR MATRICULA: 1143903".
  const holderA = text.match(new RegExp(`DATOS DEL TOMADOR\\s*\\/\\s*CONTRATANTE:?\\s*\\n\\s*(${NAME})\\s+MATRICULA`, 'i'));
  if (holderA) r.asegurado = holderA[1].trim();
  // Certificado de afiliación (ART): "la firma NOMBRE con CUIT 23948031949".
  const holderArt = text.match(new RegExp(`la firma\\s+(${NAME})\\s+con\\s+CUIT`, 'i'));
  if (holderArt) r.asegurado = holderArt[1].trim();
  // Certificado de Mercosur: "Asegurado / segurado Validez / vigencia…" and, under it,
  // "NOMBRE 04-10-2025 AL 04-10-2026".
  const mercosur = text.match(new RegExp(`Asegurado\\s*\\/\\s*segurado[^\\n]*\\n\\s*(${NAME})\\s+(\\d{2}-\\d{2}-\\d{4})\\s+AL\\s+(\\d{2}-\\d{2}-\\d{4})`, 'i'));
  if (mercosur) {
    r.asegurado = mercosur[1].trim();
    r.vigenciaDesde = mercosur[2];
    r.vigenciaHasta = mercosur[3];
  }
  // Certificado de cobertura: "PÓLIZA 12 - 9967277" (ramo - número), "NOMBRE ...", "Endoso: 30"
  const cert = text.match(/p[oó]liza\s+(\d{1,2})\s*-\s*(\d{5,9})\b/i);
  if (cert) {
    r.numeroPoliza = cert[2];
    const endoso = text.match(/endoso:\s*(\d{1,3})/i);
    if (endoso) r.numeroEndoso = endoso[1];
    const holder = text.match(new RegExp(`^NOMBRE\\s+(${NAME})\\s*$`, 'm'));
    if (holder) r.asegurado = holder[1].trim();
  }
  return r;
};

// ---------------------------------------------------------------- ATM
const atm: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // Cuponera "TU PLAN DE PAGOS": the insured is the first line.
  const holder = text.match(new RegExp(`^(${NAME})\\s+TU PLAN DE PAGOS`, 'm'));
  if (holder) r.asegurado = holder[1].trim();
  // Scanned tarjeta de circulación: the OCR glues a fragment of the next column onto the name
  // ("Asegurado: VILCHES VICTOR HUGO aguay"). The real name is the capitals before it.
  const card = text.match(/Asegurado:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{4,50}?)(?=\s+[A-ZÁÉÍÓÚÑ]?[a-zñáéíóú]|\s*$|\s*\n)/m);
  // The same table lists the countries of the assistance service, so the fragment can also be
  // a whole country name in capitals ("… MIGUEL PARAGUAY", "… HUGO AGUAY").
  if (card && /Veh[ií]culo|Patente|Motor/i.test(text)) {
    r.asegurado = card[1].trim().replace(/\s+(PARAGUAY|URUGUAY|IRUGUAY|AGUAY|UAY)$/, '');
  }
  // Older receipt: "Productor 7605 POLIZA 00689294 ENDOSO 00000000" and "RECIBIMOS DE NOMBRE Pago Elec."
  // (their template cuts the name at 28 letters).
  const receipt = text.match(/\bPOLIZA\s+(\d{6,10})\s+ENDOSO\s+(\d{1,8})\b/);
  if (receipt) {
    r.numeroPoliza = receipt[1];
    r.numeroEndoso = String(parseInt(receipt[2], 10));
  }
  const received = text.match(new RegExp(`RECIBIMOS DE (${NAME})\\s+Pago\\s+Elec`, 'i'));
  if (received) r.asegurado = received[1].trim();
  return r;
};

// ---------------------------------------------------------------- Agrosalta
const agrosalta: Layout = (text, _fileName, current) => {
  const r: Partial<RuleExtractionResult> = {};
  // Cuponera: "GARBACCIO MARA GEORGINA Moneda: Pesos Asegurado: GARBACCIO ... Mon: Pesos"
  // — the name ends where "Moneda:" starts.
  // The name ends at "Moneda:", at the next "Campo:" (": Productor:") or at the end of the line;
  // some coupons print a client number first ("4-MEDINA, PABLO").
  const holder = text.match(
    new RegExp(`asegurado:\\s*(?:\\d+-)?(${NAME})(?=\\s*:|\\s+Mon(?:eda)?:|\\s*\\n|\\s*$|\\s+\\.\\s)`, 'i')
  );
  if (holder) r.asegurado = holder[1].trim();
  // Tarjeta de seguro obligatorio, scanned: the OCR often spells the label "Asesurado" and the
  // name ends where the card's boilerplate ("SEGURO OBLIGATORIO AUTOMOTOR…") begins.
  const card = text.match(new RegExp(`ase[gs]urado\\s*:\\s*(${NAME})\\s*(?::|SEGURO OBLIGATORIO)`, 'i'));
  if (card && !holder) r.asegurado = card[1].trim();
  // Cuponera: "Póliza/Prop.: 8254065 Cuota: 1/4" and "Endoso: 0"
  const policy = text.match(/p[oó]liza\/prop\.?:\s*(\d{4,10})/i);
  if (policy) {
    r.numeroPoliza = policy[1];
    const endoso = text.match(/endoso:\s*(\d{1,3})/i);
    if (endoso) r.numeroEndoso = endoso[1];
    r.tipoDocumento = 'Cuponera';
  }
  // Scanned frente: the OCR garbles the endoso column ("7.641.479 e | sata |")
  // but still reads "NOMBRE 7.641.479" on one line under the table header.
  // A frente that says "PÓLIZA NUEVA" is endoso 0 by definition. In scans the endoso column comes
  // out of the OCR as a stray letter, and the generic pass then read the next number on the line
  // as the endoso (making a new policy look like an Endoso).
  if (!policy && /p[oó]liza\s+nueva/i.test(text)) {
    r.numeroEndoso = '0';
    r.tipoDocumento = 'Póliza';
  }
  // Only a fallback: text-layer frentes already read fine (the "CODIGO 2.310.889"
  // line below the header is NOT the policy), so it fills in only what is missing.
  if (!policy && (!current.numeroPoliza || !current.asegurado)) {
    const row = text.match(
      new RegExp(`tomador\\s*\\/\\s*asegurado\\s+p[oó]liza[\\s\\S]{0,200}?^(?!CODIGO)(${NAME})\\s+(\\d{1,2}\\.\\d{3}\\.\\d{3})\\b`, 'im')
    );
    if (row) {
      if (!current.asegurado) r.asegurado = row[1].trim().replace(/,\s*$/, '');
      if (!current.numeroPoliza) r.numeroPoliza = row[2].replace(/\./g, '');
    }
  }
  return r;
};

// ---------------------------------------------------------------- Allianz
const allianz: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // "CONTRATANTE: APELLIDO, NOMBRE" is the right label; the bare word
  // "asegurado" matched a sentence of the conditions instead.
  const holder = text.match(new RegExp(`contratante:\\s*(${NAME})\\s*(?:\\n|$)`, 'i'));
  if (holder) r.asegurado = holder[1].trim();
  return r;
};

// ---------------------------------------------------------------- Mapfre (Vida / Accidentes Personales)
const mapfre: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // Constancia de cobertura: "Póliza N° : 2370224599201" = ramo (3) + número
  // (8 digits) + endoso (2) -> 237 | 02245992 | 01.
  const cert = text.match(/p[oó]liza\s*n[°º]\s*:?\s*(\d{3})(\d{8})(\d{2})\b/i);
  if (cert) {
    r.numeroPoliza = cert[2];
    r.numeroEndoso = String(parseInt(cert[3], 10));
    const holder = text.match(new RegExp(`tomador:?:?[^|\\n]*\\|\\s*(${NAME}):\\s*\\d{11}`, 'i'));
    if (holder) r.asegurado = holder[1].trim();
    return r;
  }
  // Frente / cuponera: "105-01917745-01" (ramo - número de 8 dígitos - endoso), the
  // number sometimes printed without its leading zero ("105-1917745-01").
  const dashed = text.match(/\b(\d{3})-(\d{7,8})-(\d{2})(?:\s*\/\s*(\d{4}))?\b/);
  if (dashed) {
    r.numeroPoliza = dashed[2].padStart(8, '0');
    // The header is "237-2245995-01 / 0001": ramo - número - ítem / ENDOSO (4 digits).
    // The "01" is the ítem, not the endoso. Only the header carries the endoso.
    if (dashed[4]) {
      const endoso = parseInt(dashed[4], 10);
      r.numeroEndoso = String(endoso);
      r.tipoDocumento = endosoType(endoso);
    }
  }
  return r;
};

// ---------------------------------------------------------------- Integrity (scanned constancias)
const integrity: Layout = (text) => {
  const r: Partial<RuleExtractionResult> = {};
  // A scanned constancia de cobertura comes out of the OCR with the values but
  // none of the labels (they are drawn in the image): a line "NOMBRE 20944659464"
  // (name + CUIT/DNI) and a 12-digit policy number padded with zeros on another.
  if (!/p[oó]liza\s*n[°º]/i.test(text)) {
    const policy = text.match(/\b(0{6}\d{6})\b/);
    if (policy) r.numeroPoliza = policy[1];
    const holder = text.match(new RegExp(`^(${NAME})\\s+\\d{11}\\s*$`, 'm'));
    if (holder) r.asegurado = holder[1].trim();
    // Its title is drawn in the image too; "Para ser presentado ante quien corresponda" is the
    // constancia de cobertura's own sentence.
    if (policy && /para ser presentado ante quien corresponda/i.test(text)) r.tipoDocumento = 'Cobertura';
  }
  return r;
};

export const LAYOUT_RULES: Record<string, Layout> = {
  'mercantil-andina': mercantilAndina,
  gestion: gestionDigna,
  digna: gestionDigna,
  'san-cristobal': sanCristobal,
  'federacion-patronal': federacionPatronal,
  'atm-seguros': atm,
  agrosalta,
  allianz,
  mapfre,
  integrity,
};
