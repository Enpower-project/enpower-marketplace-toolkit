import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { EventService, EventListener } from 'hateoas-utils';
import { CompleteProfileModalComponent } from '../../../shared/components/complete-profile-modal/complete-profile-modal.component';

@Injectable({ providedIn: 'root' })
export class FirstLoginModalService extends EventListener {
  private dialog = inject(MatDialog);

  constructor(eventService: EventService) {
    super(eventService);
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // Escucha evento de necesidad de completar perfil
    this.fmap.set('PROFILE_COMPLETION_NEEDED', this.handleProfileCompletionNeeded.bind(this));
    
    this.eventSubscribe();
  }

  private handleProfileCompletionNeeded(payload: any): void {
    // Abrir modal para completar perfil
    const dialogRef = this.dialog.open(CompleteProfileModalComponent, {
      width: '600px',
      disableClose: true, // El usuario debe completar el perfil
      data: { userId: payload.userId }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
      } else {
      }
    });
  }
}
