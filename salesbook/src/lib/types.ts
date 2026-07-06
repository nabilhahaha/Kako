import type { ToneKey } from './tokens';

/** Localized string — every user-facing content value carries both languages. */
export type L = { ar: string; en: string };
export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark';

export const loc = (v: L | undefined, lang: Locale): string =>
  v ? v[lang] ?? v.ar : '';

export type ApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface Chip { t: L; tone: ToneKey }

export interface Contact {
  n: L; ini: string; role: L; badge: 'decision' | 'buy' | 'fin';
  phone: string; v: number; vBy: L; vWhen: L; note: L;
}

export interface CustomerNote {
  by: L; ini: string; av: string; when: L; txt: L;
  likes: number; comments: number; img: boolean; voice: boolean; st: ApprovalStatus;
}

export interface HistEntry {
  f: L; old: L; nw: L; by: L; when: L; st: ApprovalStatus;
}

export interface Pay {
  short: L; tone: ToneKey; delay: L; credit: L; creditState: L;
  risk: L; riskTone: ToneKey; light: 'g' | 'y' | 'r'; reports: number;
}

export interface Move {
  speed: L; days: L; trend: number[]; cats: L[]; catLine: L;
}

export interface Kyc {
  decision: L; decisionV: number; buyer: L; buyerV: number;
  fin: L; finV: number; note: L; updated: L;
}

export interface Customer {
  id: string; name: L; area: L; city: 'الرياض' | 'جدة' | 'الدمام'; dist: L; distN: number;
  score: number; late: boolean; stale: boolean; verif: number;
  ini: string; av: string; updBy: L; updWhen: L; updTxt: L; comments: number;
  chips: Chip[]; pay: Pay; move: Move; avg: L; best: L; kyc: Kyc; warn: L;
  contacts: Contact[]; notes: CustomerNote[]; hist: HistEntry[];
}

export interface MembershipRequest {
  id: string; n: L; ini: string; co: L; job: L; phone: string; city: L; when: L;
  status?: ApprovalStatus;
}

export interface ReviewItem {
  id: string; cust: L; field: L; old: L; nw: L; by: L; when: L; kind: L;
  status?: ApprovalStatus;
}

export interface Notif {
  sym: string; tone: ToneKey; tt: L; txt: L; when: L; act: string;
}

export type PostType = 'post' | 'note' | 'pay' | 'media' | 'reminder';

export interface Post {
  id: string; type: PostType; by: L; ini: string; av: string; act: L;
  cid: string; cust: L; when: L; txt: L; kind: L; tone: ToneKey;
  img: boolean; voice: boolean; likes: number; comments: number; tags?: string[];
}

export interface Job {
  id: string; t: L; co: L; ini: string; city: L; sal: L; tags: L[]; when: L; hot: boolean;
}

export interface Talent { n: L; ini: string; exp: L; city: L; pts: string; tags: L[]; yrs?: number; cat?: L; skills?: L[] }

export interface Leader { r: string; n: L; ini: string; sub: L; pts: string; me: boolean }

export interface ConnReq { id: string; n: L; ini: string; av: string; sub: L; mut: L }

export interface Suggest { n: L; ini: string; av: string; sub: L; mut: L; member: boolean }

export interface Chat {
  id: string; n: L; ini: string; av: string; last: L; when: L; unread: number; online: boolean;
}

export interface ChatMsg {
  me: boolean; t?: L; kind?: 'cust' | 'voice'; when: L; read?: boolean;
}

export interface Group { id: string; n: L; ini: string; tone: ToneKey; mem: L; act: L }

export interface EventItem {
  id: string; d: string; m: L; t: L; by: L; kind: L; tone: ToneKey; going: L;
}

export interface MemberExp { r: L; co: L; per: L }

export interface Member {
  n: L; ini: string; av: string; title: L; city: L; mut: L; pts: string; conns: string;
  about: L; exp: MemberExp[]; skills: L[]; certs: L[];
}

export interface Bootstrap {
  customers: Customer[];
  requests: MembershipRequest[];
  reviews: ReviewItem[];
  notifs: Notif[];
  posts: Post[];
  jobs: Job[];
  talents: Talent[];
  leaders: Leader[];
  connreqs: ConnReq[];
  suggest: Suggest[];
  chats: Chat[];
  chatseed: ChatMsg[];
  groups: Group[];
  events: EventItem[];
  member: Member;
  reasons: L[];
}
