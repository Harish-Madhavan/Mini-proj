import {
  Shield,
  Layers,
  Globe,
  GitMerge,
  Network,
  ShieldAlert,
  Radio,
  FileText,
  BriefcaseBusiness,
  ClipboardCheck,
  Scale,
  Clock3
} from 'lucide-react';

/**
 * Single navigation source for the header tabs, keyboard shortcuts, and the
 * command palette. The first ten items map to Alt+1..9 and Alt+0.
 */
export const NAV_ITEMS = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: Shield },
  { id: 'trace', path: '/trace', label: 'Tracing', icon: Layers },
  { id: 'osint', path: '/osint', label: 'Request prep', icon: Globe },
  { id: 'clustering', path: '/clustering', label: 'Clustering', icon: GitMerge },
  { id: 'syndicate', path: '/syndicate', label: 'Linked cases', icon: Network },
  { id: 'risk', path: '/risk', label: 'Risk', icon: ShieldAlert },
  { id: 'watchlist', path: '/watchlist', label: 'Watchlist', icon: Radio },
  { id: 'report', path: '/report', label: 'Report', icon: FileText },
  { id: 'recovery', path: '/recovery', label: 'Recovery', icon: BriefcaseBusiness },
  { id: 'evidence', path: '/evidence', label: 'Evidence review', icon: ClipboardCheck },
  { id: 'compare', path: '/compare', label: 'Case comparison', icon: Scale },
  { id: 'timeline', path: '/timeline', label: 'Timeline', icon: Clock3 }
];
