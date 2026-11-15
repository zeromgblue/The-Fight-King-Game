import type { Subject } from './questions';

export type MonsterType = 'blob' | 'skull' | 'beast';
export type ObsKind = 'tree' | 'rock' | 'pillar' | 'cactus' | 'wall' | 'crystal';

export interface MonsterDef { name: string; type: MonsterType; c1: string; c2: string; }
export interface NpcDef { name: string; subject: Subject; robe: string; hat: string; lines: string[]; quiz?: boolean; craft?: boolean; quest?: boolean; harbor?: boolean; outpost?: boolean; role?: string; }
export interface StageDef {
  id: number; name: string; sub: string; rec: number;
  theme: { g1: string; g2: string; path: string; obs: ObsKind; oc: string; root: number };
  enemies: MonsterDef[]; boss: MonsterDef;
  intro: string; bossIntro: string; clear: string;
  npcs: NpcDef[]; town?: boolean; hub?: boolean;
  drops?: { mob: [string, number]; boss: [string, number, number] };
}

export const STORY_INTRO =
  'หมอกแห่งการลืมเลือนแผ่ปกคลุมแผ่นดิน ความรู้และประวัติศาสตร์ของอาณาจักรกำลังเลือนหายไปทีละหน้า ' +
  'เจ้าลืมตาขึ้นบนเกาะสุโขทัย เกาะแรกของทะเลโลก 1 ที่นี่คือบ้านและจุดเริ่มต้นของผู้กล้า ' +
  'ฟาร์มเลเวลจากมอนสเตอร์ ล้มบอสเพื่อเก็บวัตถุดิบไปตีดาบ แล้วล่องเรือไปพิชิตเกาะต่อไป ขอให้โชคดี';

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'เกาะสุโขทัย', sub: 'เกาะแรก • จุดเริ่มต้นของผู้กล้า', rec: 1, hub: true, drops: { mob: ['goo', 0.4], boss: ['straw', 1, 2] },
    theme: { g1: '#5f9e4a', g2: '#528c3f', path: '#c9b27a', obs: 'tree', oc: '#2f6b32', root: 57 },
    enemies: [
      { name: 'เมือกทุ่งนา', type: 'blob', c1: '#6bbf59', c2: '#3f8a3a' },
      { name: 'หนูนาจอมโหด', type: 'beast', c1: '#a67c52', c2: '#6b4a2a' },
    ],
    boss: { name: 'ราชาเมือกฟาง', type: 'blob', c1: '#e0c04a', c2: '#a8862a' },
    intro: 'เกาะสุโขทัย บ้านและจุดเริ่มต้นของผู้กล้า ลานกลางเมืองมีร้านค้าและช่างตีดาบ ส่วนรอบนอกคือทุ่งฟาร์มมอนสเตอร์ และบอสอยู่ที่ลานริมเกาะ',
    bossIntro: 'ราชาเมือกฟางลุกขึ้นกลางทุ่ง "ผู้ใดล้ำเข้ามา เจ้าจะต้องลืมทุกสิ่ง!"',
    clear: 'ราชาเมือกฟางสลายไป หมอกบางส่วนจางลง เส้นทางสู่ป่าล้านนาเปิดออกแล้ว',
    npcs: [
      { name: 'ช่างตีดาบ', role: 'ร้านช่างตีดาบ • คราฟอาวุธ', subject: 'math', robe: '#8a3a2a', hat: '#c9c2b0', craft: true, lines: ['ข้าตีดาบให้ผู้กล้ามาหลายรุ่นแล้ว', 'เอาวัตถุดิบจากมอนสเตอร์และบอสมาให้ข้า แล้วข้าจะตีดาบให้เจ้า'] },
      { name: 'ปราชญ์ผู้เฒ่า', role: 'เล่าเรื่องเกาะ', subject: 'history', robe: '#b8472f', hat: '#e0c04a', lines: ['ยินดีต้อนรับสู่เกาะสุโขทัย เกาะแรกของโลกใบนี้', 'ล่ามอนสเตอร์เพื่อฟาร์มเลเวล แล้วท้าทายราชาเมือกฟางที่ลานบอสริมเกาะ', 'เมื่อแกร่งพอ ก็ลงเรือไปยังเกาะอื่นได้ เกาะที่เลเวลสูงอันตรายกว่ามาก'] },
      { name: 'พ่อค้าผลปีศาจ', role: 'ร้านผลปีศาจ (เร็ว ๆ นี้)', subject: 'science', robe: '#6a3a9a', hat: '#ffd84a', lines: ['ผลปีศาจกินแล้วได้พลังเฉพาะตัว', 'ข้ายังรอสินค้าจากต่างแดน เร็ว ๆ นี้จะเปิดร้านนะ'] },
      { name: 'ครูฝึกพลัง', role: 'ฝึกพลัง/สเตตัส (เร็ว ๆ นี้)', subject: 'science', robe: '#3a7a4a', hat: '#d9c27a', lines: ['อยากแข็งแกร่งต้องอัปสเตตัส ทั้งวิ่ง ดาบ และหมัด', 'ระบบฝึกพลังกำลังจะเปิด เร็ว ๆ นี้'] },
      { name: 'ผู้ดูแลท่าเรือ', role: 'ท่าเรือ • เรียกเรือ', subject: 'history', robe: '#1f5a7a', hat: '#e8e0c8', harbor: true, lines: ['ยินดีต้อนรับสู่ท่าเรือเกาะสุโขทัย', 'ผู้กล้าทุกคนมีเรือเป็นของตัวเอง เรียกเข้าท่าได้ทุกเมื่อ แล้วออกทะเลไปยังเกาะอื่นได้เลย'] },
      { name: 'ผู้ดูแลภารกิจ', subject: 'history', robe: '#2a6aa8', hat: '#ffd84a', quest: true, lines: ['ยินดีต้อนรับ ผู้กล้า! ข้าดูแลกระดานภารกิจของเกาะนี้', 'รับภารกิจแล้วออกไปปราบมอนสเตอร์ ทำสำเร็จจะได้ EXP และทองก้อนโต', 'อยากอัปเลเวลต้องทำภารกิจต่อเนื่อง กลับมารับใหม่ได้เสมอ'] },
      { name: 'ผู้ดูแลภารกิจสนามฟาร์ม', role: 'รับภารกิจ (สนามฟาร์ม)', subject: 'history', robe: '#2a8a6a', hat: '#ffd84a', quest: true, outpost: true, lines: ['ข้าประจำจุดรับภารกิจภาคสนาม จะได้ไม่ต้องเดินกลับไปที่ลานเมือง', 'รับภารกิจจากข้าแล้วลุยมอนสเตอร์รอบนี้ได้เลย ทำสำเร็จรางวัลจ่ายให้ทันที'] },
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

export interface Weapon { name: string; minLevel: number; atk: number; color: string; glow: string; craft?: boolean; }
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
  for (const x of WEAPONS) if (!x.craft && level >= x.minLevel) w = x;
  return w;
}
export function bestArmor(level: number): Armor {
  let a = ARMORS[0];
  for (const x of ARMORS) if (level >= x.minLevel) a = x;
  return a;
}

export const MAX_LEVEL = 1000; // world 1 cap
export const expForLevel = (lv: number) => Math.round(40 + lv * 35 + lv * lv * 0.12); // tune freely
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

// ================================================================== cave / mine mode (ids 11-15)
export const MINE_FIRST_ID = 11;
export const MINE_UNLOCK_STAGE = 3; // story stage that must be cleared first
export const isMine = (id: number) => id >= MINE_FIRST_ID;
export const MINES: StageDef[] = [
  {
    id: 11, name: 'เหมืองเก่าเชิงเขา', sub: 'ปากทางสู่ใต้ดิน', rec: 7,
    theme: { g1: '#6a5a48', g2: '#5c4e3e', path: '#a08c6a', obs: 'rock', oc: '#7a6850', root: 50 },
    enemies: [
      { name: 'ค้างคาวเหมือง', type: 'beast', c1: '#6a5a7a', c2: '#3a2a4a' },
      { name: 'เมือกสนิม', type: 'blob', c1: '#c0804a', c2: '#7a4a26' },
    ],
    boss: { name: 'หนอนแร่ยักษ์', type: 'blob', c1: '#d0a050', c2: '#6a4a1a' },
    intro: 'เหมืองเก่าแก่ที่ถูกทิ้งร้าง เสียงหยดน้ำก้องในอุโมงค์มืด ตะเกียงของคนงานยังส่องแสงริบหรี่',
    bossIntro: 'พื้นสั่นสะเทือน หนอนแร่ยักษ์ชูหัวขึ้นจากกองหิน!',
    clear: 'หนอนแร่ยักษ์ล้มลง อุโมงค์ลึกลงไปอีกชั้นเปิดออกแล้ว',
    npcs: [
      { name: 'คนงานเหมืองเฒ่า', subject: 'science', robe: '#7a5a3a', hat: '#e0b040', lines: ['ข้าขุดแร่มาทั้งชีวิต', 'ตอบคำถามเรื่องหินและแร่ของข้าให้ได้ แล้วจะมีรางวัล'] },
      { name: 'ช่างตีเหล็ก', subject: 'math', robe: '#8a4a2a', hat: '#c9c2b0', lines: ['แร่กองนี้ต้องชั่งให้ถูก', 'ช่วยข้าคิดเลขหน่อยเถิด'] },
    ],
  },
  {
    id: 12, name: 'อุโมงค์ผลึกเรืองแสง', sub: 'ผลึกฟ้าใต้พิภพ', rec: 9,
    theme: { g1: '#3a4a6a', g2: '#323f5c', path: '#6a7aa0', obs: 'crystal', oc: '#5aa8e8', root: 52 },
    enemies: [
      { name: 'ผีผลึก', type: 'skull', c1: '#b8e0ff', c2: '#4a8aff' },
      { name: 'เมือกน้ำแข็ง', type: 'blob', c1: '#9ad8f0', c2: '#3a8ab0' },
    ],
    boss: { name: 'ราชาผลึกฟ้า', type: 'skull', c1: '#8ad0ff', c2: '#2a60d0' },
    intro: 'ผลึกเรืองแสงสีฟ้าสะท้อนไปทั่วอุโมงค์ สวยงามแต่แฝงอันตราย',
    bossIntro: 'ผลึกทั้งอุโมงค์สั่นไหว ราชาผลึกฟ้าประกอบร่างขึ้นมา!',
    clear: 'ราชาผลึกแตกเป็นเสี่ยง แสงสีฟ้าดับลง ทางลึกลงไปเปิดออก',
    npcs: [
      { name: 'นักธรณีวิทยา', subject: 'science', robe: '#3a7a9a', hat: '#e8e0c8', lines: ['ผลึกเหล่านี้เกิดจากแร่หลายล้านปี', 'ลองตอบปัญหาของข้าดูสิ'] },
      { name: 'พ่อค้าอัญมณี', subject: 'math', robe: '#6a4a9a', hat: '#ffd84a', lines: ['อัญมณีชิ้นนี้ราคาเท่าไรนะ', 'ช่วยข้าคำนวณหน่อย'] },
    ],
  },
  {
    id: 13, name: 'ถ้ำค้างคาวหมอก', sub: 'เสียงปีกก้องในความมืด', rec: 11,
    theme: { g1: '#4a4458', g2: '#403a4e', path: '#7a7288', obs: 'rock', oc: '#5a5268', root: 54 },
    enemies: [
      { name: 'ค้างคาวหมอก', type: 'beast', c1: '#8a7aa8', c2: '#3a2a5a' },
      { name: 'ผีถ้ำ', type: 'skull', c1: '#d8d0e8', c2: '#a05aff' },
    ],
    boss: { name: 'ราชินีค้างคาว', type: 'beast', c1: '#7a4aa8', c2: '#2a1a48' },
    intro: 'หมอกเย็นเยียบลอยอยู่ในถ้ำกว้าง ฝูงค้างคาวนับพันห้อยอยู่บนเพดาน',
    bossIntro: 'เสียงกรีดร้องก้องถ้ำ ราชินีค้างคาวกางปีกพุ่งลงมา!',
    clear: 'ราชินีค้างคาวร่วงลง ฝูงค้างคาวสงบ หมอกจางลงเผยทางลง',
    npcs: [
      { name: 'นักสำรวจถ้ำ', subject: 'science', robe: '#5a6a4a', hat: '#d9c27a', lines: ['ในถ้ำนี้มีสิ่งมีชีวิตแปลก ๆ เต็มไปหมด', 'ตอบคำถามของข้าได้ไหม'] },
      { name: 'นักจารึกเก่า', subject: 'history', robe: '#8a5a7a', hat: '#e8d5a3', lines: ['ผนังถ้ำมีรอยจารึกโบราณ', 'เจ้ารู้เรื่องราวเหล่านั้นหรือไม่'] },
    ],
  },
  {
    id: 14, name: 'ธารลาวาใต้พิภพ', sub: 'ไฟแห่งใจกลางโลก', rec: 13,
    theme: { g1: '#5a3a30', g2: '#4e322a', path: '#8a5a44', obs: 'rock', oc: '#8a3a22', root: 56 },
    enemies: [
      { name: 'เมือกลาวา', type: 'blob', c1: '#ff7a2a', c2: '#a8280a' },
      { name: 'ผีเพลิงเหมือง', type: 'skull', c1: '#ffd0a0', c2: '#ff4a1a' },
    ],
    boss: { name: 'มังกรลาวาน้อย', type: 'beast', c1: '#e0481a', c2: '#6a1408' },
    intro: 'ลาวาไหลเป็นสายใต้เท้า ความร้อนแผดเผาจนอากาศสั่นไหว ระวังอย่าให้ถูกไฟเผา',
    bossIntro: 'ลาวาพุ่งสูง มังกรลาวาน้อยโผล่ขึ้นจากธารไฟ!',
    clear: 'มังกรลาวาจมลงสู่ธารไฟ ความร้อนลดลง ทางสู่ห้องแร่ลึกที่สุดเปิดออก',
    npcs: [
      { name: 'ช่างหลอมโลหะ', subject: 'science', robe: '#a8481a', hat: '#e0c04a', lines: ['ไฟที่นี่ร้อนพอจะหลอมเหล็กได้', 'แต่ข้าอยากรู้ว่าเจ้ารู้เรื่องไฟแค่ไหน'] },
      { name: 'ผู้พิทักษ์เก่า', subject: 'history', robe: '#6a3a2a', hat: '#c9b27a', lines: ['ข้าเฝ้าเหมืองนี้มาหลายร้อยปี', 'ตอบปัญหาของข้าให้ได้เสียก่อน'] },
    ],
  },
  {
    id: 15, name: 'ห้องนิรันดร์แห่งแร่', sub: 'หัวใจของเหมืองทั้งปวง', rec: 15,
    theme: { g1: '#6a5a2a', g2: '#5c4e22', path: '#c0a050', obs: 'crystal', oc: '#e0b838', root: 58 },
    enemies: [
      { name: 'ผีแร่ทอง', type: 'skull', c1: '#fff0b0', c2: '#e0a020' },
      { name: 'เมือกทองคำ', type: 'blob', c1: '#ffd84a', c2: '#a8801a' },
    ],
    boss: { name: 'ราชาแร่ศิลาทอง', type: 'beast', c1: '#ffd84a', c2: '#8a5a0a' },
    intro: 'ห้องใหญ่ที่เต็มไปด้วยแร่ทองและผลึกส่องประกาย นี่คือหัวใจของเหมืองทั้งปวง',
    bossIntro: 'ทองคำทั้งห้องหลอมรวมกัน ราชาแร่ศิลาทองลุกขึ้นยืน!',
    clear: 'ราชาแร่ศิลาทองแตกกระจาย แร่ทองไหลออกมาเป็นสายธาร เหมืองกลับคืนสู่ความสงบ',
    npcs: [
      { name: 'หัวหน้าคนงานเหมือง', subject: 'math', robe: '#b8902a', hat: '#e8e0c8', lines: ['ทองคำกองนี้ต้องนับให้ถูกต้อง', 'ช่วยข้าคิดเลขหน่อยเถิด'] },
      { name: 'ปราชญ์ใต้ดิน', subject: 'history', robe: '#6a5a8a', hat: '#ffd84a', lines: ['เหมืองนี้เก็บเรื่องราวของแผ่นดินไว้', 'ตอบคำถามของข้าให้ได้'] },
    ],
  },
];
export const getStage = (id: number): StageDef => (isMine(id) ? MINES[id - MINE_FIRST_ID] : STAGES[id - 1]);

// ================================================================== world 1: islands (stages + caves become floating islands)
export const ISLANDS: StageDef[] = [...STAGES, ...MINES];
// recommended level per island, climbing to ~1000
const ISLAND_RECS = [1, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500, 620, 780, 950];
ISLANDS.forEach((s, i) => { s.rec = ISLAND_RECS[i]; });
// gear unlock levels stretched to the 1-1000 range
const scaleLv = (l: number) => (l <= 1 ? 1 : Math.round(1 + (l - 1) * 28));
for (const arr of [WEAPONS, ARMORS, HELMETS, SUBS, CHARMS] as { minLevel: number }[][]) for (const o of arr) o.minLevel = scaleLv(o.minLevel);
export const islandIndex = (id: number) => ISLANDS.findIndex(s => s.id === id);

// ================================================================== items, crafting
export const ITEMS: Record<string, { name: string; color: string; desc: string }> = {
  goo: { name: 'เมือกเหนียว', color: '#8adf6a', desc: 'หยดเมือกที่หลุดจากมอนสเตอร์ ใช้คราฟอาวุธ' },
  straw: { name: 'แกนฟางทอง', color: '#f0d050', desc: 'แกนพลังจากราชาเมือกฟาง ใช้คราฟอาวุธ' },
};
WEAPONS.push({ name: 'ดาบฟางทอง', minLevel: 1, atk: 14, color: '#ffd84a', glow: '#fff0a0', craft: true });
export const CRAFT_WEAPON = WEAPONS.length - 1;
export const RECIPES: { weapon: number; need: Record<string, number>; gold: number }[] = [
  { weapon: CRAFT_WEAPON, need: { straw: 3, goo: 10 }, gold: 300 },
];

// every non-hub island gets its own quest-giver (the hub already has one)
for (const st of ISLANDS) if (!st.hub) st.npcs.unshift({ name: 'ผู้ดูแลภารกิจ', subject: 'history', robe: '#2a6aa8', hat: '#ffd84a', quest: true, lines: [`ยินดีต้อนรับสู่${st.name}`, 'รับภารกิจจากข้าก่อน แล้วค่อยออกล่ามอนสเตอร์ ทำสำเร็จจะได้ EXP และทองก้อนโต'] });
