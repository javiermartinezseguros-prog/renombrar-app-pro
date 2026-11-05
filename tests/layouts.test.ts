import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCompany, extractPolicyFromText } from '../src/utils/companies';
import { cleanInsuredName, maskCompanyCuits, normalizeOcrArtifacts } from '../src/utils/companies/cleanup';

// Short synthetic documents (no real customer data) shaped like the templates measured
// on the real archive. They pin down each layout rule so a change that breaks one is noticed.

// ---- Generic clean-up ----

test('the OCR\'s "N*" / "N?" read as "N°" so the usual labels match again', () => {
  assert.equal(normalizeOcrArtifacts('PÓLIZA N* 123 ENDOSO N? 4 y N. 5'), 'PÓLIZA N° 123 ENDOSO N° 4 y N. 5');
  const { data } = extractPolicyFromText('Allianz Argentina PÓLIZA N* 556677 Endoso N? 3 CONTRATANTE: DIAZ, ANA MARIA\n', 'scan.pdf');
  assert.equal(data.numeroPoliza, '556677');
  assert.equal(data.numeroEndoso, '3');
  assert.equal(data.tipoDocumento, 'Endoso');
});

test('an insurer\'s own CUIT is never read as a policy number', () => {
  assert.equal(maskCompanyCuits('CUIT: 30-69940815-4 y otro 20-11111111-1'), 'CUIT: CUIT-EMISOR y otro 20-11111111-1');
  const { data } = extractPolicyFromText(
    'ATM Compañía de Seguros S.A., CUIT: 30-69940815-4 TARJETA DE CIRCULACION Asegurado: PEREZ JUAN',
    'x.pdf'
  );
  assert.notEqual(data.numeroPoliza, '69940815');
});

test('sentences and one-word values are not accepted as the insured\'s name', () => {
  assert.equal(cleanInsuredName('EL PRESENTE ES UN INSTRUMENTO PROVISORIO'), undefined);
  assert.equal(cleanInsuredName('ADVERTENCIAS'), undefined);
  assert.equal(cleanInsuredName('PRESCRIPTA POR EL FACULTATIVO, CON MOTIVO DE T'), undefined);
  assert.equal(cleanInsuredName('A'.repeat(70) + ' B'), undefined);
  assert.equal(cleanInsuredName('PEREZ JUAN CARLOS CLIENTE'), 'PEREZ JUAN CARLOS');
  assert.equal(cleanInsuredName('GARCIA, MARIA FIRMA DEL ASEGURADO'), 'GARCIA, MARIA');
  assert.equal(cleanInsuredName('MUSTAQE INDUMENTARIA SA'), 'MUSTAQE INDUMENTARIA SA');
});

// ---- Company detection ----

test('Mercantil Andina is recognized by its glued web address and by template phrases without a name', () => {
  assert.equal(detectCompany('Registrate en www.mercantilandina.com.ar con tu DNI', 'a.pdf')?.id, 'mercantil-andina');
  assert.equal(detectCompany('El presente plan de pago para la póliza 003512092 reemplaza', 'a.pdf')?.id, 'mercantil-andina');
  assert.equal(detectCompany('Certificamos que esta Aseguradora cubre el riesgo indicado a continuación', 'a.pdf')?.id, 'mercantil-andina');
});

test('a barrio called San Cristóbal in an address does not make the document a San Cristóbal one', () => {
  const doc = 'Pag. 01 Ubicación del Riesgo CABA-SAN CRISTOBAL Certificamos que esta Aseguradora cubre el riesgo indicado';
  assert.equal(detectCompany(doc, 'a.pdf')?.id, 'mercantil-andina');
  assert.equal(detectCompany('SAN CRISTÓBAL SEGUROS GENERALES Póliza 1', 'a.pdf')?.id, 'san-cristobal');
});

test('the San Cristóbal payment coupon is no longer taken for ATM\'s (both print "pago electrónico")', () => {
  assert.equal(detectCompany('C.U.I.T. 34-50004533-9 Inscrip. SSN 0192 CL PAGO ELECTRÓNICO', 'a.pdf')?.id, 'san-cristobal');
});

test('Gestión and Digna, companies the app did not know, are recognized by name or CUIT', () => {
  assert.equal(detectCompany('Entre Gestión Compañía Argentina de Seguros S.A. (en adelante', 'a.pdf')?.id, 'gestion');
  assert.equal(detectCompany('CUIT: 30-71483881-0 FRENTE DE POLIZA', 'a.pdf')?.id, 'gestion');
  assert.equal(detectCompany('clientes@digna.com.ar FRENTE DE POLIZA', 'a.pdf')?.id, 'digna');
  assert.equal(detectCompany('CUIT: 30-71214858-2', 'a.pdf')?.id, 'digna');
});

// ---- Mercantil Andina ----

const MERCANTIL_FRENTE = (poliza: string, endoso: string, extra = '') =>
  [
    'Registrate en www.mercantilandina.com.ar con tu DNI y este código 9052256',
    'ACCIDENTES PERSONALES',
    `${poliza} ${endoso}`,
    '15.01.2024 14.02.2024',
    'BRITEZ JULIO JAVIER JARA',
    'AVDA. AVELLANEDA N° 2250',
    'Según se detalla en suplemento adicional 01',
    `Suplemento Adicional 01 - Poliza ${poliza}/${endoso.slice(1)} Prd. 225-21200 /86801 Asegurado 1`,
    extra,
  ].join('\n');

test('Mercantil frente de póliza: endoso 0 is a Póliza, not an Endoso because of "Suplemento Adicional 01"', () => {
  const { data, matchedCompany } = extractPolicyFromText(MERCANTIL_FRENTE('003912882', '000000'), 'PZA.pdf');
  assert.equal(matchedCompany?.id, 'mercantil-andina');
  assert.equal(data.numeroPoliza, '003912882');
  assert.equal(data.numeroEndoso, '0');
  assert.equal(data.tipoDocumento, 'Póliza');
  assert.equal(data.asegurado, 'BRITEZ JULIO JAVIER JARA');
  assert.equal(data.vigenciaDesde, '15.01.2024');
  assert.equal(data.rubro, 'ACCIDENTES PERSONALES');
});

test('Mercantil frente de póliza: the 6-digit endoso is read and the document is an Endoso', () => {
  const { data } = extractPolicyFromText(MERCANTIL_FRENTE('003820187', '000001'), 'PZA.pdf');
  assert.equal(data.numeroEndoso, '1');
  assert.equal(data.tipoDocumento, 'Endoso');
});

test('Mercantil cuponera: the three numbers are policy, endoso and instalment — the instalment is not the endoso', () => {
  const { data } = extractPolicyFromText(
    '004016880 000 02 ACCIDENTES PERSONALES (06) 004016880 000 02 ACCIDENTES PERSONALES (06)\n' +
      '8451801 POCE GABRIEL: Rivadavia Av 7063, (1406) MONTSERRAT | 8451801 POCE GABRIEL: 05.06.2024\n' +
      'El presente plan de pago para la póliza 004016880 reemplaza cualquier documento',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '004016880');
  assert.equal(data.numeroEndoso, '0');
  assert.equal(data.tipoDocumento, 'Cuponera');
});

test('Mercantil cuponera, second layout (no endoso): policy and insured', () => {
  const { data } = extractPolicyFromText(
    '003512092 ACCIDENTES PERSONALES (06) 003512092 ACCIDENTES PERSONALES (06)\n' +
      '8765868 ANTUNEZ WALTER EDUARDO: Boero 517, (1854) LONGCHAMPS B A | 8765868 ANTUNEZ WALTER EDUARDO: 16.01.2023\n' +
      'Endoso\n25.01.2023 $ 3.290,36\nEl presente plan de pago para la póliza 003512092 reemplaza',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '003512092');
  assert.equal(data.numeroEndoso, '0');
  assert.equal(data.asegurado, 'ANTUNEZ WALTER EDUARDO');
});

test('Mercantil certificate of the newer printing: "NNNNNNNNN EEEE Pag. 1" carries policy and endoso', () => {
  const { data } = extractPolicyFromText(
    '004735380\nAUTOMOTORES\n014919812 0010 Pag. 1\n588358571 0001\n02.01.2025 - 02.02.2025\nMARTINEZ ALVARO ORLANDO\nHUMBOLT 290\n' +
      'Certificamos que esta Aseguradora cubre el riesgo indicado a continuación',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '014919812');
  assert.equal(data.numeroEndoso, '10');
  assert.equal(data.asegurado, 'MARTINEZ ALVARO ORLANDO');
  assert.equal(data.tipoDocumento, 'Cobertura');
});

// ---- Gestión / Digna ----

test('Gestión frente: name, policy written with dots, endoso column', () => {
  const { data, matchedCompany } = extractPolicyFromText(
    'Entre Gestión Compañía Argentina de Seguros S.A. (en adelante "el Asegurador")\nFRENTE DE POLIZA\n' +
      'TOMADOR POLIZA Nº ENDOSO Nº FEC. EMISION LUGAR\nMARTINEZ, ORLANDO JAVIER 23.586 2 18/07/2023 C.A.B.A.\n',
    'x.pdf'
  );
  assert.equal(matchedCompany?.id, 'gestion');
  assert.equal(data.numeroPoliza, '23586');
  assert.equal(data.numeroEndoso, '2');
  assert.equal(data.tipoDocumento, 'Endoso');
  assert.equal(data.asegurado, 'MARTINEZ ORLANDO JAVIER');
});

test('Digna certificate: no endoso column means endoso 0', () => {
  const { data } = extractPolicyFromText(
    'clientes@digna.com.ar CERTIFICADO GRUPAL DE COBERTURA\nTOMADOR POLIZA Nº FEC. EMISION LUGAR\nGIMENEZ PASCUAL ADRIAN 34.760 08/05/2023 C.A.B.A.\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '34760');
  assert.equal(data.numeroEndoso, '0');
});

test('Gestión cuponera: policy and endoso from the "Secc. Póliza Endo." row, name between the vertical letters', () => {
  const { data } = extractPolicyFromText(
    'Gestión Compañía Argentina de\nAsegurado Patente Asegurado Patente\nI: D FERNANDEZ ASUNCION RAMON GIMENEZ | M: P FERNANDEZ ASUNCION RAMON GIMENEZ\n' +
      'Nº Cuota Fecha Vto. Secc. Póliza Endo. Nº Cuota Fecha Vto. Secc. Póliza Endo.\nD Ñ R\n1 22/08/2023 12 23765 0 1 22/08/2023 12 23765 0\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '23765');
  assert.equal(data.numeroEndoso, '0');
  assert.equal(data.tipoDocumento, 'Cuponera');
  assert.equal(data.asegurado, 'FERNANDEZ ASUNCION RAMON GIMENEZ');
});

// ---- San Cristóbal ----

test('San Cristóbal cuponera: policy and insured from "SOCIO:"', () => {
  const { data, matchedCompany } = extractPolicyFromText(
    'C.U.I.T. 34-50004533-9 Inscrip. SSN 0192\nPÓLIZA: 01-05-06-30080434 | Nro CUENTA: 01-04274459 | Nro CUPÓN: 1124670415\n' +
      'RAMO: ACCIDENTES PERSONALES | SOCIO: LOPEZ MARCELINO | RAMO: ACCIDENTES PERSONALES\nCL PAGO ELECTRÓNICO',
    'x.pdf'
  );
  assert.equal(matchedCompany?.id, 'san-cristobal');
  assert.equal(data.numeroPoliza, '30080434');
  assert.equal(data.asegurado, 'LOPEZ MARCELINO');
});

test('San Cristóbal certificado individual is a Cobertura and the client is the TOMADOR', () => {
  const { data } = extractPolicyFromText(
    'Seguro de Accidentes personales - AP Colectivo - Certificado Individual de Incorporación\n' +
      'TOMADOR: GARBACCIO MARA GEORGINA | RAMO: Accidentes personales | VIGENCIA DESDE: 00HS DEL 10/12/2025 | VIGENCIA HASTA: 00HS DEL 09/01/2026\n' +
      'DIRECCIÓN: PAUL GROUSSAC 1808 | N° PÓLIZA / N° FACTURA: 01-05-06-30081430 | ENDOSO: 0 | LUGAR Y FECHA EMISIÓN: Buenos Aires\n' +
      'San Cristóbal SMSG certifica por el presente, que la persona designada Asegurado',
    'x.pdf'
  );
  assert.equal(data.tipoDocumento, 'Cobertura');
  assert.equal(data.asegurado, 'GARBACCIO MARA GEORGINA');
  assert.equal(data.numeroPoliza, '30081430');
});

// ---- Federación Patronal ----

test('Federación "pago consolidado": the header names the main policy, not the first one listed', () => {
  const { data } = extractPolicyFromText(
    'FEDERACION PATRONAL Seguros\nPAGO CONSOLIDADO al 28-04-2026\nSECCIÓN AUTOMOTORES PÓLIZA 34853295\nPlan de pago consolidado:\n' +
      '* Póliza: 19-32395012-0 Riesgo: VIDA MODULAR (último endoso facturado: 0)\n' +
      '* Póliza: 4-34853295-0 Riesgo: Pat.AF298JG RENAULT (último endoso facturado: 0)\nASEGURADO: 2331812 DURANTE ALEJANDRO JOSE\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '34853295');
  assert.equal(data.numeroEndoso, '0');
  assert.equal(data.tipoDocumento, 'Póliza');
});

test('Federación tarjeta de RC: policy, endoso and the client\'s name', () => {
  const { data } = extractPolicyFromText(
    'FEDERACION PATRONAL\nPóliza 32864803 / 0 Póliza 32864803 - 0 - 0\nSEGURO OBLIGATORIO DEL AUTOMOTOR CONFORME DECRETO 1716/08\nCliente: 4870135 GIRONES VICTOR MAXIMILIANO (Reglamentario de la Ley',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '32864803');
  assert.equal(data.asegurado, 'GIRONES VICTOR MAXIMILIANO');
  assert.equal(data.tipoDocumento, 'Tarjeta de RC');
});

test('Federación cuponera: "Pólizas: 4-32020158-0 / 7-1211096-0" — the first is the main one, and "CLIENTE" is not part of the name', () => {
  const { data } = extractPolicyFromText(
    'FEDERACION PATRONAL Seguros S.A.U.\nRecibo 040320201580000/01\nAsegurado: ROLDAN LIDIA BEATRIZ Cliente:6206886\nPólizas: 4-32020158-0 / 7-1211096-0 / 19-28706921-0\nCuota 1/12',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '32020158');
  assert.equal(data.asegurado, 'ROLDAN LIDIA BEATRIZ');
});

// ---- Allianz / Mapfre / Integrity ----

test('Allianz: the insured is the CONTRATANTE, not a sentence of the conditions', () => {
  const { data } = extractPolicyFromText(
    'ALLIANZ ARGENTINA COMPAÑÍA DE SEGUROS S.A.\nCONTRATANTE: SEGLIN, ELENA ROSA\nPOLIZA N°\n242100555248\n' +
      'asegurado: PRESCRIPTA POR EL FACULTATIVO, CON MOTIVO DE T',
    'x.pdf'
  );
  assert.equal(data.asegurado, 'SEGLIN, ELENA ROSA');
});

test('Mapfre constancia de cobertura: the 13-digit code is ramo (3) + número (8) + endoso (2)', () => {
  const { data } = extractPolicyFromText(
    'CONSTANCIA DE COBERTURA\nPor medio del presente MAPFRE ARGENTINA Seguros de Vida S.A.\nPóliza N° : 2370224599201 Vigencia desde el 20/05/2025\n' +
      'Tomador:: CUIT/CUIL/DU: | ALFONZO HERRERA, LUIS GERARDO: 27964162293\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '02245992');
  assert.equal(data.numeroEndoso, '1');
  assert.equal(data.asegurado, 'ALFONZO HERRERA, LUIS GERARDO');
});

test('Mapfre header "237-2245995-01 / 0001": the endoso is the last group, not the ítem', () => {
  const { data } = extractPolicyFromText('MAPFRE ARGENTINA\n3 / 12 / 237-2245995-01 / 0001 - T\n', 'x.pdf');
  assert.equal(data.numeroPoliza, '02245995');
  assert.equal(data.numeroEndoso, '1');
  assert.equal(data.tipoDocumento, 'Endoso');
});

test('Integrity scanned constancia (labels missing from the OCR): policy is the 12-digit number, name is the line with the CUIT', () => {
  const { data } = extractPolicyFromText(
    'INTEGRITY SEGUROS\n12/06/2026\nALFONZO HERRERA, LUIS GERARDO 27964162293\n\nALBARRACIN 2050 000000134191\n\n1000 7253426\n' +
      'AC - LABORAL EN ALTURA 20-60 MTS E IN ITINERE\nPara ser presentado ante quien corresponda.',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '000000134191');
  assert.equal(data.asegurado, 'ALFONZO HERRERA, LUIS GERARDO');
});

test('Agrosalta cuponera: policy, endoso and the name up to "Moneda:"', () => {
  const { data } = extractPolicyFromText(
    'Agrosalta Cooperativa de Seguros\nPóliza/Prop.: 8254065 Cuota: 1/4\nEndoso: 0 Vencimiento: 10/03/2026\n' +
      'Asegurado: GARBACCIO MARA GEORGINA Moneda: Pesos Asegurado: GARBACCIO MARA GEORGINA Mon: Pesos',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '8254065');
  assert.equal(data.asegurado, 'GARBACCIO MARA GEORGINA');
  assert.equal(data.tipoDocumento, 'Cuponera');
});

// ---- Certificates (second round) ----

test('Federación certificate, older printing: the client is under "DATOS DEL TOMADOR/CONTRATANTE"', () => {
  const { data } = extractPolicyFromText(
    'FEDERACION PATRONAL\nCertificado de Cobertura Nro: 0099 - 5372337\nACCIDENTES PERSONALES PÓLIZA: 10370365\n' +
      'DATOS DEL TOMADOR/CONTRATANTE:\nFLOSI LUIS OMAR MATRICULA: 1143903\nDOMICILIO: PAREJA Nro.2386',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '10370365');
  assert.equal(data.asegurado, 'FLOSI LUIS OMAR');
  assert.equal(data.tipoDocumento, 'Cobertura');
});

test('Federación ART "certificado de afiliación" is a Cobertura and the client is "la firma …"', () => {
  const { data } = extractPolicyFromText(
    'Certificado de Afiliación\nFEDERACION PATRONAL SEGUROS S.A.\nPÓLIZA N°: 5206679\nPor medio de la presente, dejamos constancia que la firma MAZACOTE ORTIZ HUGO JAVIER con\nCUIT 23948031949, ha cumplimentado la afiliacion',
    'x.pdf'
  );
  assert.equal(data.tipoDocumento, 'Cobertura');
  assert.equal(data.asegurado, 'MAZACOTE ORTIZ HUGO JAVIER');
});

test('Federación Mercosur certificate: name and validity on the line under "Asegurado / segurado"', () => {
  const { data } = extractPolicyFromText(
    'CERTIFICADO DE MERCOSUR / CARTIFICADO DE MERCOSUL\nSECCION AUTOMOTORES PRODUCTO ASEGURA2 PÓLIZA 34547502\nFEDERACION PATRONAL\n' +
      'Asegurado / segurado Validez / vigencia Coasegurado / cosegurado\nGIRONES VICTOR MAXIMILIANO 04-10-2025 AL 04-10-2026\nLUCIANO TORRENT N* 955',
    'x.pdf'
  );
  assert.equal(data.asegurado, 'GIRONES VICTOR MAXIMILIANO');
  assert.equal(data.vigenciaDesde, '04-10-2025');
});

test('Digna "certificado de cobertura individual": name under the header, policy on its own line', () => {
  const { data } = extractPolicyFromText(
    'clientes@digna.com.ar CERTIFICADO DE COBERTURA INDIVIDUAL\nTOMADOR / ASEGURADO POLIZA Nº VIGENCIA\nGIMENEZ, FERNANDEZ ASUNCION RAMON Desde (*) Hasta las 24 hs.\n20029\n877 2.062 13/10/2022 28/10/2022\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '20029');
  assert.equal(data.asegurado, 'GIMENEZ FERNANDEZ ASUNCION RAMON');
});

test('Digna "anexo de póliza": policy and endoso from the row under the table header', () => {
  const { data } = extractPolicyFromText(
    'clientes@digna.com.ar\nANEXO DE POLIZA\nSECCIÓN PÓLIZA Nº ENDOSO Nº VIGENCIA\nDesde las 00 hs. Hasta las 24 hs.\n11 - Accidentes Personales Individual 29.421 0\n03/07/2023 02/07/2024\n',
    'x.pdf'
  );
  assert.equal(data.numeroPoliza, '29421');
  assert.equal(data.numeroEndoso, '0');
});

// ---- ATM scanned card ----

test('ATM scanned tarjeta: the fragment of the next column is not part of the name', () => {
  const { data } = extractPolicyFromText(
    'ATM SEGUROS\nPólica Nro. 04 - osesrezs Envía SOS\nAsegurado: TOLEDO RIVERO FABRICIO NEHUEN Paraguay 4858\nVehículo: HONDA GLH 150\nPatente: A152KYL Año: 2022\nSEGURO OBLIGATORIO AUTOMOTOR',
    'x.pdf'
  );
  assert.equal(data.asegurado, 'TOLEDO RIVERO FABRICIO NEHUEN');
  // The policy digits come out of the OCR as letters ("osesrezs"): it must stay empty, never invented.
  assert.equal(data.numeroPoliza, undefined);
});
