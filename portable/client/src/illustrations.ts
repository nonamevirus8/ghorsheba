// Inline SVG illustrations used in place of the six binary photos that
// live in the Muse artifact's `client/src/assets/`.
//
// Why this file exists: the GitHub connector can only push UTF-8 text
// files, so the .webp/.jpg photos never reached the repository and the
// Vercel build failed with `Could not resolve "./assets/hero-team.webp"`.
// These illustrations are plain text (SVG data URIs), need no binary
// files, and keep every layout, feature and workflow unchanged. If the
// real photos are added to the repo later with a regular git client,
// App.tsx can import them again and this file can be removed.

function uri(viewBox: string, body: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' ` +
    `preserveAspectRatio='xMidYMid slice'>${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Flat worker figure, drawn with feet at (0,0) and body extending up.
// `arm` is extra markup (an arm line / held tool) in the same coordinates.
function worker(
  x: number,
  y: number,
  shirt: string,
  hat: string,
  skin: string,
  arm: string,
  scale = 1,
): string {
  return (
    `<g transform='translate(${x} ${y}) scale(${scale})'>` +
    // legs + boots
    `<rect x='-17' y='-36' width='13' height='36' rx='4' fill='#33526B'/>` +
    `<rect x='4' y='-36' width='13' height='36' rx='4' fill='#33526B'/>` +
    `<rect x='-19' y='-5' width='17' height='6' rx='3' fill='#263238'/>` +
    `<rect x='2' y='-5' width='17' height='6' rx='3' fill='#263238'/>` +
    // free arm (down)
    `<line x1='-19' y1='-72' x2='-27' y2='-38' stroke='${shirt}' stroke-width='10' stroke-linecap='round'/>` +
    // torso
    `<rect x='-21' y='-84' width='42' height='50' rx='10' fill='${shirt}'/>` +
    // working arm + tool
    arm +
    // head + hard hat
    `<circle cx='0' cy='-100' r='14' fill='${skin}'/>` +
    `<path d='M-15 -102 A15 15 0 0 1 15 -102 Z' fill='${hat}'/>` +
    `<rect x='-19' y='-103' width='38' height='5' rx='2.5' fill='${hat}'/>` +
    `</g>`
  );
}

// ------------------------------------------------------------- hero team
const heroBody =
  `<defs><linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#F2FBF3'/><stop offset='1' stop-color='#DDF2E2'/>` +
  `</linearGradient></defs>` +
  `<rect width='800' height='600' fill='url(#sky)'/>` +
  // sun + clouds
  `<circle cx='668' cy='102' r='64' fill='#FF8A00' opacity='0.22'/>` +
  `<circle cx='668' cy='102' r='42' fill='#FF8A00'/>` +
  `<g fill='#FFFFFF' opacity='0.9'>` +
  `<ellipse cx='138' cy='92' rx='58' ry='20'/><ellipse cx='182' cy='78' rx='40' ry='16'/>` +
  `<ellipse cx='452' cy='64' rx='46' ry='15'/><ellipse cx='486' cy='54' rx='30' ry='12'/>` +
  `</g>` +
  // distant hills + ground
  `<path d='M0 452 Q180 402 380 440 T800 428 V600 H0 Z' fill='#C9ECD1'/>` +
  `<rect y='472' width='800' height='128' fill='#A9DCB4'/>` +
  `<path d='M0 472 H800 V492 H0 Z' fill='#97D3A4'/>` +
  // house
  `<rect x='268' y='292' width='264' height='188' fill='#FFFDF7' stroke='#E3DCC8' stroke-width='2'/>` +
  `<rect x='472' y='212' width='28' height='50' fill='#C96F3F'/>` +
  `<path d='M244 298 L400 190 L556 298 Z' fill='#064B27'/>` +
  `<path d='M244 298 L400 190 L556 298' fill='none' stroke='#FF8A00' stroke-width='7' stroke-linejoin='round'/>` +
  `<rect x='292' y='336' width='54' height='54' rx='4' fill='#BFE3F2' stroke='#FFFFFF' stroke-width='4'/>` +
  `<rect x='454' y='336' width='54' height='54' rx='4' fill='#BFE3F2' stroke='#FFFFFF' stroke-width='4'/>` +
  `<rect x='378' y='392' width='46' height='88' rx='5' fill='#FF8A00'/>` +
  `<circle cx='414' cy='438' r='4' fill='#064B27'/>` +
  `<rect x='366' y='480' width='70' height='10' rx='3' fill='#D8CBAF'/>` +
  // scaffolding (left of the house)
  `<rect x='106' y='238' width='9' height='242' fill='#7A8B7A'/>` +
  `<rect x='197' y='238' width='9' height='242' fill='#7A8B7A'/>` +
  `<line x1='110' y1='250' x2='202' y2='330' stroke='#7A8B7A' stroke-width='6'/>` +
  `<line x1='202' y1='250' x2='110' y2='330' stroke='#7A8B7A' stroke-width='6'/>` +
  `<rect x='90' y='318' width='132' height='11' rx='3' fill='#C98F4E'/>` +
  `<rect x='90' y='408' width='132' height='11' rx='3' fill='#C98F4E'/>` +
  // brick stack + bushes
  `<g fill='#C96F3F'><rect x='586' y='452' width='52' height='16' rx='2'/><rect x='586' y='434' width='52' height='16' rx='2'/><rect x='592' y='416' width='40' height='16' rx='2'/></g>` +
  `<circle cx='252' cy='466' r='20' fill='#087A35' opacity='0.85'/><circle cx='548' cy='466' r='24' fill='#087A35' opacity='0.85'/>` +
  // workers: one on the scaffold with a roller, two on the ground
  worker(
    156, 329, "#087A35", "#FF8A00", "#A06A3B",
    `<line x1='19' y1='-72' x2='34' y2='-104' stroke='#087A35' stroke-width='10' stroke-linecap='round'/>` +
    `<rect x='28' y='-126' width='13' height='24' rx='3' fill='#FFFFFF' stroke='#C9D4C9' stroke-width='2'/>`,
    0.92,
  ) +
  worker(
    96, 480, "#FF8A00", "#FFFFFF", "#8D5A33",
    `<line x1='19' y1='-72' x2='30' y2='-44' stroke='#FF8A00' stroke-width='10' stroke-linecap='round'/>` +
    `<rect x='-34' y='-96' width='86' height='10' rx='4' transform='rotate(-16)' fill='#C98F4E'/>`,
  ) +
  worker(
    618, 480, "#064B27", "#FF8A00", "#6E4525",
    `<line x1='19' y1='-72' x2='31' y2='-42' stroke='#064B27' stroke-width='10' stroke-linecap='round'/>` +
    `<rect x='24' y='-40' width='34' height='24' rx='4' fill='#E67A00'/>` +
    `<path d='M32 -40 v-8 h18 v8' fill='none' stroke='#B35C00' stroke-width='4'/>`,
  ) +
  // grass tufts
  `<g stroke='#087A35' stroke-width='4' stroke-linecap='round'>` +
  `<path d='M60 560 l-6 -16 M60 560 l2 -18 M60 560 l9 -14'/>` +
  `<path d='M716 548 l-6 -16 M716 548 l2 -18 M716 548 l9 -14'/>` +
  `<path d='M330 566 l-6 -16 M330 566 l2 -18 M330 566 l9 -14'/>` +
  `</g>`;

export const heroImg = uri("0 0 800 600", heroBody);

// ------------------------------------------------------- mistri portrait
const mistriBody =
  `<rect width='640' height='480' fill='#064B27'/>` +
  `<circle cx='320' cy='215' r='168' fill='#0B6B38'/>` +
  `<circle cx='320' cy='215' r='128' fill='#087A35'/>` +
  `<g transform='translate(320 428)'>` +
  // legs + boots
  `<rect x='-52' y='-58' width='38' height='58' rx='8' fill='#33526B'/>` +
  `<rect x='14' y='-58' width='38' height='58' rx='8' fill='#33526B'/>` +
  `<rect x='-58' y='-8' width='48' height='10' rx='4' fill='#1D2A30'/>` +
  `<rect x='10' y='-8' width='48' height='10' rx='4' fill='#1D2A30'/>` +
  // arms
  `<line x1='-72' y1='-196' x2='-104' y2='-96' stroke='#FF8A00' stroke-width='30' stroke-linecap='round'/>` +
  `<line x1='72' y1='-196' x2='112' y2='-128' stroke='#FF8A00' stroke-width='30' stroke-linecap='round'/>` +
  // torso + reflective stripes
  `<rect x='-78' y='-232' width='156' height='178' rx='26' fill='#FF8A00'/>` +
  `<rect x='-78' y='-168' width='156' height='18' fill='#FFE1B3' opacity='0.85'/>` +
  `<rect x='-78' y='-104' width='156' height='18' fill='#FFE1B3' opacity='0.85'/>` +
  // head + smile + hard hat
  `<circle cx='0' cy='-286' r='52' fill='#C68850'/>` +
  `<circle cx='-19' cy='-280' r='6' fill='#3A2410'/>` +
  `<circle cx='19' cy='-280' r='6' fill='#3A2410'/>` +
  `<path d='M-20 -256 A24 24 0 0 0 20 -256' fill='none' stroke='#5B3A1E' stroke-width='6' stroke-linecap='round'/>` +
  `<path d='M-56 -296 A56 56 0 0 1 56 -296 Z' fill='#FFC46B'/>` +
  `<rect x='-68' y='-298' width='136' height='11' rx='5.5' fill='#FFC46B'/>` +
  // toolbox in the left hand
  `<g transform='translate(-146 -96)'>` +
  `<path d='M14 0 v-16 a10 10 0 0 1 10 -10 h44 a10 10 0 0 1 10 10 v16' fill='none' stroke='#B35C00' stroke-width='7'/>` +
  `<rect x='0' y='0' width='92' height='58' rx='9' fill='#E67A00'/>` +
  `<rect x='36' y='18' width='20' height='14' rx='3' fill='#B35C00'/>` +
  `</g>` +
  // wrench in the right hand
  `<g transform='translate(118 -140) rotate(28)'>` +
  `<rect x='-8' y='0' width='16' height='74' rx='7' fill='#D7DEE2'/>` +
  `<path d='M0 -26 a24 24 0 1 0 24 24 l-14 -6 4 -16 z' fill='#D7DEE2'/>` +
  `</g>` +
  `</g>`;

export const mistriImg = uri("0 0 640 480", mistriBody);

// -------------------------------------------------------- service scenes
function scene(body: string): string {
  return uri(
    "0 0 800 400",
    `<rect width='800' height='400' fill='#F0FAF2'/>` +
      `<circle cx='400' cy='205' r='128' fill='#E2F4E7'/>` +
      `<ellipse cx='400' cy='336' rx='190' ry='18' fill='#D8EDDC'/>` +
      body,
  );
}

export const svcElectrician = scene(
  `<path d='M428 62 L318 224 L392 224 L350 338 L494 172 L412 172 Z' fill='#FF8A00' stroke='#E67A00' stroke-width='6' stroke-linejoin='round'/>` +
    `<path d='M196 320 C250 268 300 300 336 262' fill='none' stroke='#064B27' stroke-width='7' stroke-linecap='round'/>` +
    `<g transform='translate(168 322)'><rect x='-16' y='-12' width='32' height='30' rx='6' fill='#064B27'/><line x1='-8' y1='-12' x2='-8' y2='-26' stroke='#064B27' stroke-width='6' stroke-linecap='round'/><line x1='8' y1='-12' x2='8' y2='-26' stroke='#064B27' stroke-width='6' stroke-linecap='round'/></g>` +
    `<g fill='#087A35'><path d='M150 96 l6 14 14 6 -14 6 -6 14 -6 -14 -14 -6 14 -6 z'/><path d='M612 84 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 z'/><path d='M648 268 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 z'/></g>`,
);

export const svcPlumber = scene(
  `<rect x='118' y='176' width='564' height='48' rx='24' fill='#8FA9BC'/>` +
    `<rect x='118' y='176' width='564' height='16' rx='8' fill='#ADC4D4'/>` +
    `<rect x='556' y='200' width='48' height='104' rx='10' fill='#8FA9BC'/>` +
    `<rect x='540' y='196' width='80' height='20' rx='8' fill='#6E8CA3'/>` +
    `<g transform='translate(392 168) rotate(32)'>` +
    `<rect x='-13' y='-6' width='26' height='128' rx='11' fill='#064B27'/>` +
    `<path d='M0 -58 a36 36 0 1 0 36 36 l-19 -8 6 -22 z' fill='#064B27'/>` +
    `</g>` +
    `<g fill='#4D96FF'><path d='M238 96 C252 118 262 132 262 146 a24 24 0 1 1 -48 0 C214 132 224 118 238 96 Z'/><path d='M606 262 C616 278 622 288 622 298 a16 16 0 1 1 -32 0 C590 288 596 278 606 262 Z'/></g>`,
);

const brickRow = (y: number, offset: number): string => {
  let out = "";
  for (let i = 0; i < 5; i++) {
    const x = 168 + offset + i * 100;
    out += `<rect x='${x}' y='${y}' width='92' height='38' rx='4' fill='${i % 2 ? "#BE6234" : "#C96F3F"}'/>`;
  }
  return out;
};

export const svcMason = scene(
  `<rect x='160' y='104' width='480' height='206' rx='6' fill='#EFE3D2'/>` +
    brickRow(112, 0) + brickRow(158, -50) + brickRow(204, 0) + brickRow(250, -50) +
    `<g transform='translate(618 96) rotate(24)'>` +
    `<path d='M0 0 L64 14 L0 30 Z' fill='#B9C6CC' stroke='#7E939E' stroke-width='3'/>` +
    `<rect x='-52' y='8' width='40' height='13' rx='6' fill='#8A5A2B'/>` +
    `</g>` +
    `<line x1='212' y1='92' x2='212' y2='196' stroke='#064B27' stroke-width='4'/>` +
    `<path d='M212 196 l-9 20 h18 z' fill='#FF8A00'/>`,
);

export const svcPainter = scene(
  `<rect x='148' y='86' width='504' height='128' rx='18' fill='#087A35'/>` +
    `<path d='M220 214 v26 a10 10 0 0 0 20 0 v-26 z' fill='#087A35'/>` +
    `<path d='M560 214 v18 a9 9 0 0 0 18 0 v-18 z' fill='#087A35'/>` +
    `<rect x='322' y='104' width='196' height='46' rx='11' fill='#FFFFFF' stroke='#C9D4C9' stroke-width='3'/>` +
    `<path d='M518 127 h34 v44 h-58' fill='none' stroke='#5B6B5B' stroke-width='8' stroke-linejoin='round'/>` +
    `<rect x='480' y='168' width='17' height='76' rx='8' fill='#FF8A00'/>` +
    `<g transform='translate(196 268)'>` +
    `<path d='M-52 0 h104 l-12 62 a8 8 0 0 1 -8 7 h-64 a8 8 0 0 1 -8 -7 z' fill='#E8E8E8' stroke='#B9C6CC' stroke-width='3'/>` +
    `<ellipse cx='0' cy='0' rx='52' ry='10' fill='#FF8A00'/>` +
    `<path d='M-40 -2 a40 26 0 0 1 80 0' fill='none' stroke='#8A9A8A' stroke-width='5'/>` +
    `</g>`,
);
