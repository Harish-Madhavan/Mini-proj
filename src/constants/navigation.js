import {
  Shield,
  Layers,
  Globe,
  GitMerge,
  Network,
  ShieldAlert,
  Radio,
  FileText
} from 'lucide-react';

/**
 * Single navigation source for the header tabs, keyboard shortcuts, and the
 * command palette. Order defines Alt+1..8 shortcuts — keep both consumers on
 * this list instead of duplicating routes.
 */
export const NAV_ITEMS = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: Shield },
  { id: 'trace', path: '/trace', label: 'Tracing', icon: Layers },
  { id: 'osint', path: '/osint', label: 'Notices', icon: Globe },
  { id: 'clustering', path: '/clustering', label: 'Clustering', icon: GitMerge },
  { id: 'syndicate', path: '/syndicate', label: 'Linked cases', icon: Network },
  { id: 'risk', path: '/risk', label: 'Risk', icon: ShieldAlert },
  { id: 'watchlist', path: '/watchlist', label: 'Watchlist', icon: Radio },
  { id: 'report', path: '/report', label: 'Report', icon: FileText }
];
