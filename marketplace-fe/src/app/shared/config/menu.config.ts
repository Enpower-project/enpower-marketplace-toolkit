import { MenuElement } from 'dst-ui-kit';

// Interfaz extendida para soportar categorías
export interface MenuCategory {
  name: string;
  icon: string;
  items: MenuElement[];
  rolesEnabled?: string[];
  expanded?: boolean;
}
export const TOP_LEVEL_ITEMS: MenuElement[] = [
  new MenuElement({
    routerLink: '/home',
    materialIcon: 'home',
    name: 'Dashboard',
    rolesEnabled: ['FMO_LMO', 'DSO', 'prosumer', 'FSP', 'MARKETPLACE_ADMIN', 'FRP'],
    breadcrumbElements: [
      { title: 'Home' }
    ],
    cyData: 'dashboard-menu'
  })
];

export const MENU_CATEGORIES: MenuCategory[] = [
  // Categoría: Sessions Management (solo para FMO_LMO)
  {
    name: 'Sessions Management',
    icon: 'storefront',
    rolesEnabled: ['FMO_LMO'],
    items: [
      new MenuElement({
        routerLink: '/market-info',
        materialIcon: 'info',
        name: 'Market Info',
        rolesEnabled: ['dso', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Info' }
        ],
        cyData: 'market-info-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'APPROVED' },
        materialIcon: 'check_circle',
        name: 'Market Sessions Approved',
        rolesEnabled: ['FRP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Approved' }
        ],
        cyData: 'market-sessions-approved-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'PUBLISHED' },
        materialIcon: 'publish',
        name: 'Market Sessions Published',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Published' }
        ],
        cyData: 'market-sessions-published-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'ACTIVE' },
        materialIcon: 'lock_open',
        name: 'Market Sessions Active',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Active' }
        ],
        cyData: 'market-sessions-active-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'IN_DELIVERY' },
        materialIcon: 'local_shipping',
        name: 'Market Sessions In Delivery',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions In Delivery' }
        ],
        cyData: 'market-sessions-in-delivery-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'SETTLED' },
        materialIcon: 'enhanced_encryption',
        name: 'Market Sessions Settled',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Settled' }
        ],
        cyData: 'market-sessions-settled-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        materialIcon: 'history',
        queryParams: { status: '' },
        name: 'Market Sessions History',
        rolesEnabled: ['FRP', 'FMO_LMO', 'FSP'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions History' }
        ],
        cyData: 'market-sessions-history-menu',
      })
    ]
  },

  // Categoría: Sessions (para FSP y FRP)
  {
    name: 'Sessions',
    icon: 'storefront',
    rolesEnabled: ['FSP', 'FRP'],
    items: [
      new MenuElement({
        routerLink: '/market-info',
        materialIcon: 'info',
        name: 'Market Info',
        rolesEnabled: ['dso', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Info' }
        ],
        cyData: 'market-info-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'DRAFT' },
        materialIcon: 'edit_note',
        name: 'Market Sessions Draft',
        rolesEnabled: ['FRP'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Draft' }
        ],
        cyData: 'market-sessions-draft-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'APPROVED' },
        materialIcon: 'check_circle',
        name: 'Market Sessions Approved',
        rolesEnabled: ['FRP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Approved' }
        ],
        cyData: 'market-sessions-approved-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'PUBLISHED' },
        materialIcon: 'publish',
        name: 'Market Sessions Published',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Published' }
        ],
        cyData: 'market-sessions-published-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'ACTIVE' },
        materialIcon: 'lock_open',
        name: 'Market Sessions Active',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Active' }
        ],
        cyData: 'market-sessions-active-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'IN_DELIVERY' },
        materialIcon: 'local_shipping',
        name: 'Market Sessions In Delivery',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions In Delivery' }
        ],
        cyData: 'market-sessions-in-delivery-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        queryParams: { status: 'SETTLED' },
        materialIcon: 'enhanced_encryption',
        name: 'Market Sessions Settled',
        rolesEnabled: ['FRP', 'FSP', 'FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions Settled' }
        ],
        cyData: 'market-sessions-settled-menu'
      }),
      new MenuElement({
        routerLink: '/market-sessions',
        materialIcon: 'history',
        queryParams: { status: '' },
        name: 'Market Sessions History',
        rolesEnabled: ['FRP', 'FMO_LMO', 'FSP'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Sessions History' }
        ],
        cyData: 'market-sessions-history-menu',
      }),
      new MenuElement({
        routerLink: '/prosumer-offers',
        materialIcon: 'local_offer',
        name: 'Offers',
        rolesEnabled: ['FSP'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Offers' }
        ],
        cyData: 'offers-menu'
      })
    ]
  },

  // Categoría: Administration (Solo Superadmin)
  {
    name: 'Administration',
    icon: 'admin_panel_settings',
    rolesEnabled: ['MARKETPLACE_ADMIN'], // Solo superadmin
    items: [
      new MenuElement({
        routerLink: '/markets-management',
        materialIcon: 'local_mall',
        name: 'Markets Management',
        rolesEnabled: ['MARKETPLACE_ADMIN'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Markets Management' }
        ],
        cyData: 'markets-management-menu'
      })
    ]
  },

  {
    name: 'Activity History',
    icon: 'account_balance_wallet',
    rolesEnabled: ['FSP', 'FMO_LMO', 'FRP', 'MARKETPLACE_ADMIN'],
    items: [
      new MenuElement({
        routerLink: '/transaction-history',
        materialIcon: 'compare_arrows',
        name: 'Transaction History',
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Market Info' }
        ],
        cyData: 'market-info-menu'
      }),
      new MenuElement({
        routerLink: '/settlement-manager',
        materialIcon: 'gavel',
        name: 'Settlement Manager',
        rolesEnabled: ['FMO_LMO'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Settlement Manager' }
        ],
        cyData: 'settlement-manager-menu'
      }),
      new MenuElement({
        routerLink: '/settlement-manager',
        materialIcon: 'gavel',
        name: 'Settlements',
        rolesEnabled: ['FRP', 'FSP'],
        breadcrumbElements: [
          { title: 'Home', routerLink: '/home' },
          { title: 'Settlements' }
        ],
        cyData: 'settlement-manager-menu'
      })
    ]
  },
];


// Mantener compatibilidad con el formato anterior para elementos simples
export const MENU_CONFIG: MenuElement[] = [
  // Logout removed - now in user menu dropdown
];
