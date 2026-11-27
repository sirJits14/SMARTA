import { useLayoutEffect, useMemo, useRef } from 'react';
import logoUrl from '../assets/bnhs_logo.png?url';
import { fitText, chunkSheets } from '../lib/tempPass.js';
import { TEMP_PASS_PRINT_STYLES } from '../pages/tempPassPrintLayout.js';

// The card artwork follows docs/superpowers/specs/assets/2026-11-27-temp-id-pass-reference.png,
// drawn on a 591 × 937 canvas (the CR80 card's proportions).
export const TEMP_PASS_LOGO_URL = logoUrl;
const INK = '#0A0A0A';
const NOTE = [
  'Note: This temporary ID pass is issued',
  'only to students without an official ID',
  'card and expires once the official ID is',
  'issued.',
];
const NOTE_WIDTH = 305;

// Text that must stay within maxWidth. When `pinned`, textLength makes the
// renderer squeeze it to exactly that width; otherwise the drawn width is
// measured in the browser and pinned only if the real glyphs run wider.
function BoundedText({ maxWidth, pinned = false, children, ...attrs }) {
  const node = useRef(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (pinned || !el?.getComputedTextLength) return;
    el.removeAttribute('textLength');
    el.removeAttribute('lengthAdjust');
    if (el.getComputedTextLength() > maxWidth) {
      el.setAttribute('textLength', String(maxWidth));
      el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  }, [children, maxWidth, pinned]);
  return (
    <text ref={node} {...attrs} {...(pinned ? { textLength: maxWidth, lengthAdjust: 'spacingAndGlyphs' } : {})}>{children}</text>
  );
}

// Centred text shrunk to its box (fitText). Letter spacing counts as part of
// each character's width and shrinks with the font.
function FittedText({ x, y, text, maxWidth, fontSize, fontWeight, letterSpacing = 0 }) {
  const fit = fitText(text, maxWidth * (0.66 / (0.66 + letterSpacing / fontSize)), fontSize);
  return (
    <BoundedText x={x} y={y} textAnchor="middle" fontSize={fit.fontSize} fontWeight={fontWeight} fill={INK}
      letterSpacing={letterSpacing ? letterSpacing * (fit.fontSize / fontSize) : undefined}
      maxWidth={maxWidth} pinned={!!fit.textLength}>{text}</BoundedText>
  );
}

export function TempPassCard({ name, sectionLine, lrn, photoSrc, qrSrc, principalName, principalTitle }) {
  return (
    <svg className="temp-pass-card" viewBox="0 0 591 937" role="img" aria-label={`Temporary ID pass for ${name}`}
      xmlns="http://www.w3.org/2000/svg" fontFamily="Arial, Helvetica, sans-serif">
      <rect width="591" height="937" fill="#FFF8F1" />
      <path d="M0 0H473V40C473 130 450 175 415 215V300H0Z" fill="#00BF63" />
      <image href={logoUrl} x="17" y="38" width="82" height="82" />
      <text x="122" y="75" fontSize="28" fontWeight="700" fill={INK}>BUKIDNON NATIONAL</text>
      <text x="122" y="104" fontSize="28" fontWeight="700" fill={INK}>HIGH SCHOOL</text>
      <text transform="translate(519 25) rotate(90)" fontSize="60" fontWeight="700" fill={INK}
        textLength="411" lengthAdjust="spacingAndGlyphs">BNHS ID PASS</text>
      <image href={photoSrc} x="169" y="172" width="272" height="272" preserveAspectRatio="xMidYMid slice" />
      <FittedText x={297} y={505} text={name} maxWidth={551} fontSize={40} fontWeight="700" />
      <FittedText x={297} y={548} text={sectionLine} maxWidth={540} fontSize={23} letterSpacing={5} />
      <FittedText x={297} y={596} text={`LRN: ${lrn}`} maxWidth={551} fontSize={28} />
      <text x="18" y="695" fontSize="13" fill={INK}>STUDENT'S TEMPORARY QR CODE:</text>
      <rect x="19" y="707" width="210" height="210" fill="#FFFFFF" />
      <image href={qrSrc} x="19" y="707" width="210" height="210" />
      <FittedText x={411} y={760} text={String(principalName ?? '').toUpperCase()} maxWidth={300} fontSize={32} fontWeight="700" />
      <FittedText x={411} y={783} text={String(principalTitle ?? '').toUpperCase()} maxWidth={300} fontSize={13} />
      {NOTE.map((line, i) => (
        <BoundedText key={line} x="263" y={856 + i * 18} fontSize="16" fontWeight="700" fill="#E53935" maxWidth={NOTE_WIDTH}>{line}</BoundedText>
      ))}
    </svg>
  );
}

// passes: [{ studentId, name, sectionLine, lrn, photoSrc, qrSrc, principalName, principalTitle }]
export function TempPassSheets({ passes }) {
  const sheets = useMemo(() => chunkSheets(passes), [passes]);
  return (
    <div className="temp-pass-sheets">
      <style>{TEMP_PASS_PRINT_STYLES}</style>
      {sheets.map((sheet, index) => (
        <div className="temp-pass-sheet" key={index}>
          {sheet.map(({ studentId, name, sectionLine, lrn, photoSrc, qrSrc, principalName, principalTitle }) => (
            <TempPassCard key={studentId} {...{ name, sectionLine, lrn, photoSrc, qrSrc, principalName, principalTitle }} />
          ))}
        </div>
      ))}
    </div>
  );
}
