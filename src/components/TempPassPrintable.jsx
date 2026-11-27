import { useLayoutEffect, useMemo, useRef } from 'react';
import logoUrl from '../assets/bnhs_logo.png?url';
import { fitText, chunkSheets } from '../lib/tempPass.js';
import { TEMP_PASS_PRINT_STYLES } from '../pages/tempPassPrintLayout.js';

// The card artwork follows docs/superpowers/specs/assets/2026-11-27-temp-id-pass-reference.png,
// drawn on a 591 × 937 canvas (the CR80 card's proportions), printed at 85 × 134.8 mm, so 1 unit is
// 85/591 mm and the 177-unit photo area is 1 × 1 inch.
export const TEMP_PASS_LOGO_URL = logoUrl;
const INK = '#0A0A0A';
const NOTE = [
  'Note: This temporary ID pass is issued',
  'only to students without an official ID',
  'card and expires once the official ID is',
  'issued.',
];
const NOTE_WIDTH = 290;

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
      {/* The green ends behind the 1 × 1 inch photo (x ≤ 386 from y 190), as in the reference. */}
      <path d="M0 0H473V40C473 120 440 165 380 190V300H0Z" fill="#00BF63" />
      <image href={logoUrl} x="17" y="38" width="82" height="82" />
      <text x="122" y="75" fontSize="28" fontWeight="700" fill={INK}>BUKIDNON NATIONAL</text>
      <text x="122" y="104" fontSize="28" fontWeight="700" fill={INK}>HIGH SCHOOL</text>
      <text transform="translate(519 25) rotate(90)" fontSize="60" fontWeight="700" fill={INK}
        textLength="411" lengthAdjust="spacingAndGlyphs">BNHS ID PASS</text>
      {photoSrc ? (
        <image href={photoSrc} x="209" y="190" width="177" height="177" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <rect x="209" y="190" width="177" height="177" fill="#FFFFFF" stroke="#555555" strokeWidth="2" strokeDasharray="8 6" />
          <text x="297.5" y="284" textAnchor="middle" fontSize="16" fill="#555555">Attach 1×1 photo</text>
        </>
      )}
      {/* The vertical BNHS ID PASS runs down to y≈436 at x 514–568, so the name's capitals start below it. */}
      <FittedText x={297} y={474} text={name} maxWidth={551} fontSize={46} fontWeight="700" />
      <FittedText x={297} y={514} text={sectionLine} maxWidth={540} fontSize={25} letterSpacing={5} />
      <FittedText x={297} y={558} text={`LRN: ${lrn}`} maxWidth={551} fontSize={32} />
      <text x="18" y="598" fontSize="14" fill={INK}>STUDENT'S TEMPORARY QR CODE:</text>
      <rect x="19" y="610" width="250" height="250" fill="#FFFFFF" />
      <image href={qrSrc} x="19" y="610" width="250" height="250" />
      <FittedText x={430} y={680} text={String(principalName ?? '').toUpperCase()} maxWidth={280} fontSize={30} fontWeight="700" />
      <FittedText x={430} y={704} text={String(principalTitle ?? '').toUpperCase()} maxWidth={280} fontSize={14} />
      {NOTE.map((line, i) => (
        <BoundedText key={line} x="284" y={790 + i * 20} fontSize="16" fontWeight="700" fill="#E53935" maxWidth={NOTE_WIDTH}>{line}</BoundedText>
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
