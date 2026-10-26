import { LayoutDashboard, Package, Hammer, Factory, ArrowLeftRight, Users, ChartNoAxesCombined } from 'lucide-react';

export const navigation = [
  { href: '/', label: 'Overview', description: 'Business performance and recent activity', icon: LayoutDashboard, group: 'Workspace' },
  { href: '/inventory', label: 'Inventory', description: 'Products, prices and finished stock', icon: Package, group: 'Workspace' },
  { href: '/raw-materials', label: 'Raw materials', description: 'Materials and available quantities', icon: Hammer, group: 'Workspace' },
  { href: '/production', label: 'Production', description: 'Plan production and review history', icon: Factory, group: 'Workspace' },
  { href: '/transactions', label: 'Transactions', description: 'Sales and stock movement', icon: ArrowLeftRight, group: 'Business' },
  { href: '/customers', label: 'Customers', description: 'Customer accounts and balances', icon: Users, group: 'Business' },
  { href: '/reports', label: 'Reports', description: 'Financial activity and invoices', icon: ChartNoAxesCombined, group: 'Business' },
];
