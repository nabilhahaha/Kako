'use client';
import { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { ScreenSkeleton } from '@/components/ui';
// Light, always-on screens load eagerly (they're the entry + primary tabs).
import { Login, Register, Pending } from './Auth';
import { Customers } from './Customers';
import { Home } from './Home';
import { Feed } from './Feed';
import { Notifications } from './Notifications';
import { Me } from './Me';
import { Settings } from './Settings';

// Heavy / less-frequent screens are code-split and lazily loaded with a skeleton.
const loading = () => <ScreenSkeleton />;
const Customer = dynamic(() => import('./Customer').then((m) => m.Customer), { loading });
const History = dynamic(() => import('./Customer').then((m) => m.History), { loading });
const Report = dynamic(() => import('./Report').then((m) => m.Report), { loading });
const Search = dynamic(() => import('./Search').then((m) => m.Search), { loading });
const Admin = dynamic(() => import('./Admin').then((m) => m.Admin), { loading });
const Review = dynamic(() => import('./Review').then((m) => m.Review), { loading });
const Careers = dynamic(() => import('./Careers').then((m) => m.Careers), { loading });
const Company = dynamic(() => import('./Company').then((m) => m.Company), { loading });
const Leaderboard = dynamic(() => import('./Leaderboard').then((m) => m.Leaderboard), { loading });
const Network = dynamic(() => import('./Network').then((m) => m.Network), { loading });
const Member = dynamic(() => import('./Member').then((m) => m.Member), { loading });
const Messages = dynamic(() => import('./Social').then((m) => m.Messages), { loading });
const Chat = dynamic(() => import('./Social').then((m) => m.Chat), { loading });
const Groups = dynamic(() => import('./Social').then((m) => m.Groups), { loading });
const Events = dynamic(() => import('./Social').then((m) => m.Events), { loading });

export const SCREENS: Record<string, ComponentType> = {
  login: Login,
  register: Register,
  pending: Pending,
  customers: Customers,
  home: Home,
  feed: Feed,
  notif: Notifications,
  me: Me,
  settings: Settings,
  customer: Customer,
  history: History,
  report: Report,
  search: Search,
  admin: Admin,
  review: Review,
  careers: Careers,
  company: Company,
  leaderboard: Leaderboard,
  network: Network,
  member: Member,
  messages: Messages,
  chat: Chat,
  groups: Groups,
  events: Events,
};
