import { Routes } from '@angular/router';
import { HomeComponent } from './shared/components/home/home.component';
import { RegisterComponent } from './shared/components/register/register.component';
import { LandingComponent } from './shared/components/landing/landing.component';
import { AuthGuard } from './core/guards/auth.guard';
import { MarketListComponent } from './features/market-factory/market-list/market-list.component';
import { CreateMarketComponent } from './features/market-factory/create-market/create-market.component';
import { MyMarketsComponent } from './features/market-factory/my-markets/my-markets.component';
import { MarketInfoPageComponent } from './features/market-factory/market-info-page/market-info-page.component';
import { AcceptInvitationComponent } from './shared/components/accept-invitation/accept-invitation.component';
import { WalletDashboardComponent } from './shared/components/wallet-dashboard/wallet-dashboard.component';
import { TransactionHistoryComponent } from './shared/components/transaction-history/transaction-history.component';
import { OffersInfoComponent } from './shared/components/home/dsopanel/components/offers-info/offers-info.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'landing', component: LandingComponent },
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'register', component: RegisterComponent },

  // Public invitation acceptance page (no auth required)
  { path: 'accept-invitation/:token', component: AcceptInvitationComponent },

  // Market Operations
  { path: 'market-info', component: MarketInfoPageComponent, canActivate: [AuthGuard] },

  // Administration (renamed routes)
  { path: 'markets-management', component: MarketListComponent, canActivate: [AuthGuard] },
  { path: 'markets-management/create', component: CreateMarketComponent, canActivate: [AuthGuard] },
  { path: 'markets-management/edit/:id', component: CreateMarketComponent, canActivate: [AuthGuard] },

  // Legacy routes (for backward compatibility)
  { path: 'markets', redirectTo: 'markets-management' },
  { path: 'my-markets', redirectTo: 'market-info' },
  { path: 'markets/create', redirectTo: 'markets-management/create' },
  { path: 'markets/edit/:id', redirectTo: 'markets-management/edit/:id' },

  // Market Operator (placeholder for future implementation)
  { path: 'market-operator', component: HomeComponent, canActivate: [AuthGuard] }, // TODO: Create dedicated component

  // Market Sessions
  {
    path: 'market-sessions',
    loadChildren: () => import('./features/sessions/sessions.routes').then(m => m.SESSIONS_ROUTES),
    canActivate: [AuthGuard]
  },

  // Prosumer Offers
  {
    path: 'prosumer-offers',
    loadChildren: () => import('./features/prosumer-offers/prosumer-offers.routes').then(m => m.PROSUMER_OFFERS_ROUTES),
    canActivate: [AuthGuard]
  },

  // Settlements
  {
    path: 'settlements',
    loadChildren: () => import('./features/settlements/settlements.routes').then(m => m.SETTLEMENTS_ROUTES),
    canActivate: [AuthGuard]
  },

  // Settlement Manager (FMO_LMO only)
  {
    path: 'settlement-manager',
    loadComponent: () => import('./features/settlements/settlement-manager/settlement-manager.component').then(m => m.SettlementManagerComponent),
    canActivate: [AuthGuard]
  },

  // NFT Certificates - Detail only (accessed from settlements)
  // List removed - NFTs are now viewed only through settlement details
  // {
  //   path: 'nft-certificates',
  //   loadComponent: () => import('./features/nft-certificates/nft-certificates-list/nft-certificates-list.component').then(m => m.NftCertificatesListComponent),
  //   canActivate: [AuthGuard]
  // },
  {
    path: 'nft-certificates/:tokenId',
    loadComponent: () => import('./features/nft-certificates/nft-certificate-detail/nft-certificate-detail.component').then(m => m.NftCertificateDetailComponent),
    canActivate: [AuthGuard]
  },

  // Wallet Dashboard
  {
    path: 'transaction-history',
    loadComponent: () => import('./shared/components/transaction-history/transaction-history.component').then(m => m.TransactionHistoryComponent),
    canActivate: [AuthGuard]
  },

  // Offers info
  {
    path: 'offers-info/:id',
    loadComponent: () => import('./shared/components/home/dsopanel/components/offers-info/offers-info.component').then(m => m.OffersInfoComponent),
    canActivate: [AuthGuard]
  },

  { path: '**', redirectTo: '' } // Wildcard route per gestire 404
];
