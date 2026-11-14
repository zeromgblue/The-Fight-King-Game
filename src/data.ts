import type { Subject } from './questions';

export type MonsterType = 'blob' | 'skull' | 'beast';
export type ObsKind = 'tree' | 'rock' | 'pillar' | 'cactus' | 'wall' | 'crystal';

export interface MonsterDef { name: string; type: MonsterType; c1: string; c2: string; }
export interface NpcDef { name: string; subject: Subject; robe: string; hat: string; lines: string[]; }
export interface StageDef {
  id: number; name: string; sub: string; rec: number;
  theme: { g1: string; g2: string; path: string; obs: ObsKind; oc: string; root: number };
  enemies: MonsterDef[]; boss: MonsterDef;
  intro: string; bossIntro: string; clear: string;
  npcs: NpcDef[];
}

export const STORY_INTRO =
  'หมอกแห่งการลืมเลือนแผ่ปกคลุมแผ่นดิน ความรู้และประวัติศาสตร์ของอาณาจักรกำลังเลือนหายไปทีละหน้า ' +
  'พระราชาทรงมอบพระราชโองการให้เจ้า อัศวินผู้กล้า ออกเดินทางผ่านดินแดนโบราณทั้งสิบ ' +
  'ตามล่าผู้พิทักษ์หมอกให้ครบทุกตน ขอให้ปัญญาและคมดาบนำทางเจ้า';

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'ทุ่งนาสุโขทัย', sub: 'ราชธานีแห่งแรก', rec: 1,
    theme: { g1: '#5f9e4a', g2: '#528c3f', path: '#c9b27a', obs: 'tree', oc: '#2f6b32', root: 57 },
    enemies: [
      { name: 'เมือกทุ่งนา', type: 'blob', c1: '#6bbf59', c2: '#3f8a3a' },
      { name: 'หนูนาจอมโหด', type: 'beast', c1: '#a67c52', c2: '#6b4a2a' },
    ],
    boss: { name: 'ราชาเมือกฟาง', type: 'blob', c1: '#e0c04a', c2: '#a8862a' },
    intro: 'ทุ่งนาแห่งสุโขทัย ดินแดนที่ศิลาจารึกถูกจารึกไว้ จงฝ่าหมอกเข้าไปและเอาชนะผู้พิทักษ์แห่งแรก',
    bossIntro: 'ราชาเมือกฟางลุกขึ้นกลางทุ่ง "ผู้ใดล้ำเข้ามา เจ้าจะต้องลืมทุกสิ่ง!"',
    clear: 'ราชาเมือกฟางสลายไป หมอกบางส่วนจางลง เส้นทางสู่ป่าล้านนาเปิดออกแล้ว',
    npcs: [
      { name: 'ปราชญ์ผู้เฒ่า', subject: 'history', robe: '#b8472f', hat: '#e0c04a', lines: ['ข้าเฝ้าศิลาจารึกมาทั้งชีวิต', 'ตอบปัญหาของข้าให้ได้ แล้วจะมีรางวัล'] },
      { name: 'พ่อค้าตลาดเช้า', subject: 'math', robe: '#3f7a8a', hat: '#d9965b', lines: ['มาช่วยคิดเลขให้ข้าหน่อยเถิด', 'ทอนเงินผิดทีไรลูกค้าบ่นทุกที'] },
    ],
  },
  {
    id: 2, name: 'ป่าล้านนา', sub: 'ป่าลึกแห่งขุนเขา', rec: 3,
    theme: { g1: '#3f7a46', g2: '#356b3b', path: '#8a7a52', obs: 'tree', oc: '#1f5a2e', root: 55 },
    enemies: [
      { name: 'เสือดาวป่า', type: 'beast', c1: '#c98a3a', c2: '#7a4a1a' },
      { name: 'เมือกหมอก', type: 'blob', c1: '#6ac0b8', c2: '#2f8a86' },
    ],
    boss: { name: 'เสือไฟขุนเขา', type: 'beast', c1: '#e0562f', c2: '#8a2a14' },
    intro: 'ป่าล้านนาเงียบสงัด ต้นไม้ใหญ่บังแสง ระวังสิ่งที่ซ่อนอยู่ในหมอก',
    bossIntro: 'เสียงคำรามก้องป่า เสือไฟขุนเขากระโจนออกมา!',
    clear: 'เสือไฟสงบลง หมอกในป่าจางไป ทางสู่กำแพงเมืองอยุธยาเปิดออก',
    npcs: [
      { name: 'นักบวชแห่งป่า', subject: 'science', robe: '#4a8a4a', hat: '#d9c27a', lines: ['ป่านี้มีความลับของธรรมชาติมากมาย', 'ลองตอบคำถามวิทยาศาสตร์ของข้าสิ'] },
      { name: 'นักเล่านิทาน', subject: 'history', robe: '#8a5aa0', hat: '#e8d5a3', lines: ['อยากฟังเรื่องเก่าแก่ไหม', 'แต่ต้องตอบปัญหาของข้าก่อนนะ'] },
    ],
  },
  {
    id: 3, name: 'กำแพงอยุธยา', sub: 'กรุงเก่าแห่งแม่น้ำเจ้าพระยา', rec: 5,
    theme: { g1: '#9a8e6c', g2: '#8a7e5e', path: '#c7b98d', obs: 'wall', oc: '#a65f45', root: 53 },
    enemies: [
      { name: 'ทหารผีกำแพง', type: 'skull', c1: '#e8e0c8', c2: '#ff8a4a' },
      { name: 'เมือกอิฐ', type: 'blob', c1: '#b0654a', c2: '#7a3a26' },
    ],
    boss: { name: 'อสูรกำแพงเพลิง', type: 'skull', c1: '#c9c2b0', c2: '#ff3a2a' },
    intro: 'ซากกำแพงเมืองอันยิ่งใหญ่ เงาทหารเก่ายังเดินวนอยู่ในหมอก',
    bossIntro: 'ไฟลุกท่วมกำแพง อสูรกำแพงเพลิงก้าวออกมาจากกองอิฐ!',
    clear: 'อสูรกำแพงแตกเป็นผุยผง เส้นทางสู่ถ้ำศิลาจารึกเปิดออก',
    npcs: [
      { name: 'ขุนนางเฒ่า', subject: 'history', robe: '#a65f45', hat: '#e0c04a', lines: ['กรุงศรีอยุธยาเคยรุ่งเรืองยิ่งนัก', 'เจ้ารู้เรื่องราวเหล่านั้นหรือไม่'] },
      { name: 'ช่างก่ออิฐ', subject: 'math', robe: '#7a6a4a', hat: '#c9b27a', lines: ['อิฐกองนี้นับให้ถูกที', 'ข้าคิดเลขไม่เก่งเลย'] },
    ],
  },
  {
    id: 4, name: 'ถ้ำศิลาจารึก', sub: 'อักษรโบราณใต้ผืนดิน', rec: 7,
    theme: { g1: '#5a5560', g2: '#4e4a54', path: '#7b7482', obs: 'rock', oc: '#8e8a96', root: 52 },
    enemies: [
      { name: 'ค้างคาวศิลา', type: 'beast', c1: '#8a8794', c2: '#4a4856' },
      { name: 'โกเลมกรวด', type: 'blob', c1: '#9a96a2', c2: '#5a5666' },
    ],
    boss: { name: 'โกเลมศิลาจารึก', type: 'blob', c1: '#8a8f99', c2: '#4a5060' },
    intro: 'ในถ้ำมีอักษรโบราณเรืองแสง ผนังถ้ำกระซิบความรู้ที่ถูกลืม',
    bossIntro: 'ผนังถ้ำสั่นสะเทือน โกเลมศิลาจารึกลุกขึ้นยืน!',
    clear: 'โกเลมพังทลาย อักษรบนผนังสว่างขึ้น ทางสู่หนองน้ำโบราณเปิดออก',
    npcs: [
      { name: 'นักโบราณคดี', subject: 'history', robe: '#6a8a9a', hat: '#e8d5a3', lines: ['ข้ากำลังถอดความอักษรบนผนัง', 'ช่วยข้าสักหน่อย'] },
      { name: 'นักธรณีวิทยา', subject: 'science', robe: '#8a6a4a', hat: '#c9a36a', lines: ['หินเหล่านี้เล่าเรื่องโลกได้', 'ลองตอบคำถามข้าดู'] },
    ],
  },
  {
    id: 5, name: 'หนองน้ำโบราณ', sub: 'บึงลึกแห่งตำนาน', rec: 9,
    theme: { g1: '#4a6a4a', g2: '#3f5d45', path: '#6d6a45', obs: 'tree', oc: '#2c4a3a', root: 50 },
    enemies: [
      { name: 'จระเข้บึง', type: 'beast', c1: '#4a8a5a', c2: '#2a4a32' },
      { name: 'เมือกพิษ', type: 'blob', c1: '#9a5ac0', c2: '#5a2a80' },
    ],
    boss: { name: 'พญานาคดำ', type: 'beast', c1: '#3a2f5a', c2: '#1a1430' },
    intro: 'หนองน้ำนิ่งสนิท ควันพิษลอยเหนือผิวน้ำ ตำนานเล่าว่ามีนาคหลับใหลอยู่ใต้บึง',
    bossIntro: 'น้ำในบึงปั่นป่วน พญานาคดำผงาดขึ้นมา!',
    clear: 'พญานาคดำจมลงสู่ก้นบึง ควันพิษจางหาย ทางสู่ทะเลทรายเปิดออก',
    npcs: [
      { name: 'หมอยาชาวบ้าน', subject: 'science', robe: '#5a8a6a', hat: '#d9c27a', lines: ['สมุนไพรกับสารเคมีก็เกี่ยวกัน', 'ตอบข้าได้ไหมเล่า'] },
      { name: 'คนพายเรือ', subject: 'math', robe: '#6a7a8a', hat: '#c9b27a', lines: ['ข้าต้องคำนวณระยะทางข้ามบึง', 'ช่วยหน่อยเถิด'] },
    ],
  },
  {
    id: 6, name: 'ทะเลทรายอียิปต์', sub: 'ดินแดนแห่งฟาโรห์', rec: 11,
    theme: { g1: '#d8b878', g2: '#c8a866', path: '#e6cf95', obs: 'cactus', oc: '#4a8a4a', root: 54 },
    enemies: [
      { name: 'แมงป่องทราย', type: 'beast', c1: '#d8a24a', c2: '#8a5a1a' },
      { name: 'มัมมี่เร่ร่อน', type: 'skull', c1: '#e8dcc0', c2: '#ffd84a' },
    ],
    boss: { name: 'ฟาโรห์มัมมี่', type: 'skull', c1: '#e0c040', c2: '#40e0ff' },
    intro: 'พีระมิดตั้งตระหง่านท่ามกลางลมทราย อารยธรรมริมแม่น้ำไนล์รอให้เจ้าไขปริศนา',
    bossIntro: 'ฝาโลงเปิดออก ฟาโรห์มัมมี่ตื่นจากการหลับใหล!',
    clear: 'ฟาโรห์กลับสู่หลุมพระศพ ทรายสงบลง เส้นทางสายไหมทอดยาวรออยู่',
    npcs: [
      { name: 'นักบวชอียิปต์', subject: 'history', robe: '#4a7ac0', hat: '#e0c040', lines: ['ริมฝั่งไนล์เกิดอารยธรรมยิ่งใหญ่', 'เจ้ารู้จักมันดีเพียงใด'] },
      { name: 'นักสำรวจดาว', subject: 'science', robe: '#4a3a7a', hat: '#e8d5a3', lines: ['ชาวอียิปต์ดูดาวเพื่อทำปฏิทิน', 'ลองตอบคำถามข้าสิ'] },
    ],
  },
  {
    id: 7, name: 'เส้นทางสายไหม', sub: 'คาราวานข้ามทวีป', rec: 13,
    theme: { g1: '#c9a15f', g2: '#b9914f', path: '#e0c27a', obs: 'rock', oc: '#8a6a3c', root: 55 },
    enemies: [
      { name: 'โจรทะเลทราย', type: 'skull', c1: '#d8c9a0', c2: '#ff5a3a' },
      { name: 'อูฐคลั่ง', type: 'beast', c1: '#c9a36a', c2: '#7a5a2a' },
    ],
    boss: { name: 'ราชาโจรคาราวาน', type: 'beast', c1: '#a8453a', c2: '#5a1a14' },
    intro: 'ผ้าไหมและเครื่องเทศเคยเดินทางผ่านเส้นทางนี้ แต่ตอนนี้ถูกโจรหมอกยึดครอง',
    bossIntro: 'ราชาโจรควบอูฐยักษ์ออกมาขวางทาง "ผ่านทางนี้ต้องจ่ายด้วยชีวิต!"',
    clear: 'ราชาโจรพ่ายแพ้ คาราวานเดินทางต่อได้อีกครั้ง ทางสู่กรุงโรมเปิดออก',
    npcs: [
      { name: 'พ่อค้าผ้าไหม', subject: 'math', robe: '#c04a6a', hat: '#e0c04a', lines: ['ข้าต้องคำนวณกำไรก่อนข้ามทะเลทราย', 'ช่วยข้าหน่อย'] },
      { name: 'นักเดินทางจากฮั่น', subject: 'history', robe: '#c03a3a', hat: '#e8d5a3', lines: ['ข้ามาจากแดนไกลทางตะวันออก', 'รู้จักประวัติแดนข้าไหม'] },
    ],
  },
  {
    id: 8, name: 'โคลอสเซียมโรมัน', sub: 'สังเวียนแห่งจักรวรรดิ', rec: 15,
    theme: { g1: '#b8aea0', g2: '#a89e90', path: '#d8cfc0', obs: 'pillar', oc: '#e8e2d6', root: 50 },
    enemies: [
      { name: 'ทหารเลเจียนผี', type: 'skull', c1: '#d8d0c0', c2: '#ff4a4a' },
      { name: 'สิงโตสังเวียน', type: 'beast', c1: '#d29b2f', c2: '#7a5214' },
    ],
    boss: { name: 'กลาดิเอเตอร์ราชัน', type: 'skull', c1: '#b8b0a0', c2: '#ff2a2a' },
    intro: 'เสาหินและสังเวียนโบราณของจักรวรรดิโรมัน เสียงเชียร์ก้องมาจากอดีต',
    bossIntro: 'ประตูสังเวียนเปิดออก กลาดิเอเตอร์ราชันชูดาบขึ้น!',
    clear: 'เสียงเชียร์เงียบลง สังเวียนว่างเปล่า ทางสู่นครวัดเปิดออก',
    npcs: [
      { name: 'วุฒิสมาชิก', subject: 'history', robe: '#e8e2d6', hat: '#c09a3a', lines: ['โรมไม่ได้สร้างในวันเดียว', 'เจ้ารู้เรื่องของมันไหม'] },
      { name: 'วิศวกรโรมัน', subject: 'math', robe: '#8a7a5a', hat: '#c9b27a', lines: ['ถนนและท่อส่งน้ำต้องคำนวณแม่นยำ', 'ช่วยข้าคำนวณทีเถิด'] },
    ],
  },
  {
    id: 9, name: 'ปราสาทนครวัด', sub: 'มหาปราสาทกลางป่า', rec: 17,
    theme: { g1: '#5f7a55', g2: '#55704c', path: '#9a9478', obs: 'pillar', oc: '#8a8f78', root: 52 },
    enemies: [
      { name: 'ยักษ์หินน้อย', type: 'blob', c1: '#8a9078', c2: '#4a5040' },
      { name: 'ลิงหินคลั่ง', type: 'beast', c1: '#9a8f78', c2: '#5a4f38' },
    ],
    boss: { name: 'เทพอสูรปราสาทหิน', type: 'blob', c1: '#6a8a5a', c2: '#2a3a24' },
    intro: 'ปราสาทหินขนาดมหึมาถูกเถาวัลย์ปกคลุม เทพอสูรหินเฝ้าอยู่ลึกเข้าไป',
    bossIntro: 'ภาพสลักบนผนังเคลื่อนไหว เทพอสูรปราสาทหินตื่นขึ้น!',
    clear: 'เทพอสูรสลายเป็นหิน เถาวัลย์ร่วงหล่น ทางสู่วิหารกาลเวลาเปิดออก',
    npcs: [
      { name: 'ผู้เฝ้าปราสาท', subject: 'history', robe: '#c9962f', hat: '#e8d5a3', lines: ['ปราสาทนี้เก่าแก่นับพันปี', 'ลองทดสอบความรู้ของเจ้า'] },
      { name: 'นักดาราศาสตร์', subject: 'science', robe: '#3a4a8a', hat: '#e0c04a', lines: ['ปราสาทนี้หันรับดวงอาทิตย์อย่างแม่นยำ', 'ตอบข้าได้ไหม'] },
    ],
  },
  {
    id: 10, name: 'วิหารกาลเวลา', sub: 'จุดสิ้นสุดแห่งความทรงจำ', rec: 19,
    theme: { g1: '#3a3260', g2: '#322b55', path: '#5a4f8a', obs: 'crystal', oc: '#b79cff', root: 48 },
    enemies: [
      { name: 'เงาแห่งการลืม', type: 'skull', c1: '#8a7ac0', c2: '#ff4ae0' },
      { name: 'เมือกกาลเวลา', type: 'blob', c1: '#7a6ad0', c2: '#3a2a80' },
    ],
    boss: { name: 'จอมมารแห่งการลืมเลือน', type: 'skull', c1: '#6a4aa0', c2: '#ff2ad0' },
    intro: 'ที่นี่คือต้นกำเนิดของหมอก ทุกความรู้ที่เจ้าเก็บมาจะถูกทดสอบเป็นครั้งสุดท้าย',
    bossIntro: 'จอมมารปรากฏกายกลางวิหาร "ทุกสิ่งจะถูกลืม ไม่เว้นแม้แต่เจ้า!"',
    clear: 'จอมมารสลายไป หมอกทั้งแผ่นดินจางหาย ความรู้และประวัติศาสตร์กลับคืนมา เจ้าคือผู้กล้าแห่งอาณาจักร!',
    npcs: [
      { name: 'ผู้พิทักษ์กาลเวลา', subject: 'history', robe: '#6a5ac0', hat: '#e8d5a3', lines: ['อดีตคือรากของปัจจุบัน', 'จงตอบปัญหาของข้า'] },
      { name: 'ผู้รักษาสมการ', subject: 'math', robe: '#4a3a8a', hat: '#b79cff', lines: ['ตัวเลขคือภาษาของจักรวาล', 'ลองอ่านมันดู'] },
    ],
  },
];

export interface Weapon { name: string; minLevel: number; atk: number; color: string; glow: string; }
export interface Armor { name: string; minLevel: number; def: number; }

export const WEAPONS: Weapon[] = [
  { name: 'ไม้พลองฝึกหัด', minLevel: 1, atk: 0, color: '#c9a36a', glow: '#e8d5a3' },
  { name: 'ดาบสำริด', minLevel: 3, atk: 6, color: '#d9965b', glow: '#ffd08a' },
  { name: 'ดาบเหล็กกล้า', minLevel: 5, atk: 12, color: '#cfd8e3', glow: '#ffffff' },
  { name: 'ดาบเพลิง', minLevel: 8, atk: 20, color: '#ff7a2f', glow: '#ffcf4a' },
  { name: 'ดาบสายฟ้า', minLevel: 12, atk: 30, color: '#ffe94d', glow: '#fffbc0' },
  { name: 'ดาบมังกรน้ำแข็ง', minLevel: 16, atk: 42, color: '#7ff0ff', glow: '#d8fbff' },
];

export const ARMORS: Armor[] = [
  { name: 'เสื้อผ้าหนัง', minLevel: 1, def: 0 },
  { name: 'เกราะสำริด', minLevel: 4, def: 4 },
  { name: 'เกราะเหล็ก', minLevel: 7, def: 9 },
  { name: 'เกราะทองคำ', minLevel: 11, def: 15 },
  { name: 'เกราะราชัน', minLevel: 15, def: 22 },
];

export function bestWeapon(level: number): Weapon {
  let w = WEAPONS[0];
  for (const x of WEAPONS) if (level >= x.minLevel) w = x;
  return w;
}
export function bestArmor(level: number): Armor {
  let a = ARMORS[0];
  for (const x of ARMORS) if (level >= x.minLevel) a = x;
  return a;
}

export const MAX_LEVEL = 30;
export const expForLevel = (lv: number) => 40 + lv * 35;
export const maxHpFor = (lv: number) => 60 + lv * 14;
export const atkFor = (lv: number) => 9 + lv * 3;
export const defFor = (lv: number) => Math.floor(lv * 0.8);

// ================================================================== customization
export interface Look { skin: number; hair: number; helmet: number; plume: number; trim: number; cape: number; boots: number; }
export interface Gear { weapon: number; armor: number; sub: number; charm: number; }

export const SKINS = ['#f2c9a0', '#e0b088', '#c8905c', '#8a5a38', '#f8dcc0'];
export const HAIRS = ['#2a1a14', '#6a4222', '#c8a050', '#b8452f', '#d8d8e0', '#3a3a6a'];
export const PLUMES = ['#c8452f', '#3f7a9a', '#5a9a4a', '#e0b040', '#7a4ac0', '#f4f0e6'];
export const TRIMS = ['#e0b040', '#c8d0d8', '#c8452f', '#3f7a9a', '#5a9a4a', '#7a4ac0'];
export const CAPES: (string | null)[] = ['#c8452f', '#3f6aa0', '#3a8a4a', '#7a4ac0', '#2a2a32', '#e0b040', null];
export const CAPE_NAMES = ['แดงชาด', 'น้ำเงินคราม', 'เขียวมรกต', 'ม่วงราชา', 'ดำสนิท', 'ทองอร่าม', 'ไม่สวมผ้าคลุม'];
export const BOOTS = ['#5a3a1e', '#2a2a32', '#8a8f99', '#a8562a', '#3a5a3a'];
export const COLOR_NAMES = {
  skin: ['ผิวสว่าง', 'ผิวสองสี', 'ผิวแทน', 'ผิวเข้ม', 'ผิวขาวนวล'],
  hair: ['ดำ', 'น้ำตาล', 'ทอง', 'แดง', 'เทาเงิน', 'น้ำเงินเข้ม'],
  plume: ['แดง', 'น้ำเงิน', 'เขียว', 'ทอง', 'ม่วง', 'ขาว'],
  trim: ['ทอง', 'เงิน', 'แดง', 'น้ำเงิน', 'เขียว', 'ม่วง'],
  boots: ['น้ำตาล', 'ดำ', 'เหล็ก', 'ส้มดิน', 'เขียวเข้ม'],
};
export interface Opt { name: string; minLevel: number; desc: string; }
export const HELMETS: Opt[] = [
  { name: 'หมวกอัศวิน', minLevel: 1, desc: 'หมวกเหล็กประดับพู่' },
  { name: 'ผ้าคาดศีรษะนักรบ', minLevel: 1, desc: 'เบาสบาย เห็นเส้นผม' },
  { name: 'หมวกเขาสัตว์', minLevel: 4, desc: 'หมวกนักรบจากป่าเหนือ' },
  { name: 'มงกุฎทองคำ', minLevel: 9, desc: 'มงกุฎแห่งผู้กล้า' },
];
export const SUBS: Opt[] = [
  { name: 'ไม่ใช้อาวุธเสริม', minLevel: 1, desc: 'มือซ้ายว่างคล่องตัว' },
  { name: 'โล่ไม้กลม', minLevel: 1, desc: 'ลดความเสียหายที่ได้รับ 15%' },
  { name: 'มีดขว้างคู่', minLevel: 3, desc: 'ขว้างมีดใส่ศัตรูที่ใกล้ที่สุดอัตโนมัติ' },
  { name: 'ลูกแก้วโคจร', minLevel: 7, desc: 'ลูกแก้วสองลูกหมุนรอบตัวชนศัตรูให้บาดเจ็บ' },
];
export const CHARMS: Opt[] = [
  { name: 'ไม่สวมเครื่องราง', minLevel: 1, desc: 'ไม่มีผลเพิ่มเติม' },
  { name: 'แหวนคมเขี้ยว', minLevel: 2, desc: 'โอกาสโจมตีติดคริติคอล +15%' },
  { name: 'สร้อยชีวิต', minLevel: 5, desc: 'HP สูงสุด +18%' },
  { name: 'ตะกรุดปัญญา', minLevel: 8, desc: 'พลังปัญญาสะสมเร็วขึ้น 60%' },
];

export const defaultLook = (): Look => ({ skin: 0, hair: 0, helmet: 0, plume: 0, trim: 0, cape: 0, boots: 0 });
export const defaultGear = (): Gear => ({ weapon: 0, armor: 0, sub: 1, charm: 0 });
