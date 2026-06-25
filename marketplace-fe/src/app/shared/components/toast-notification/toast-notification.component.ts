import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { trigger, state, style, transition, animate } from '@angular/animations';

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

@Component({
  selector: 'app-toast-notification',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './toast-notification.component.html',
  styleUrl: './toast-notification.component.css',
  animations: [
    trigger('slideIn', [
      state('void', style({
        transform: 'translateY(100%)',
        opacity: 0
      })),
      state('*', style({
        transform: 'translateY(0)',
        opacity: 1
      })),
      transition('void => *', animate('300ms ease-out')),
      transition('* => void', animate('200ms ease-in'))
    ])
  ]
})
export class ToastNotificationComponent implements OnInit {
  private static instance: ToastNotificationComponent;
  messages: Array<ToastMessage & { id: number }> = [];
  private messageIdCounter = 0;

  constructor() {
    ToastNotificationComponent.instance = this;
  }

  ngOnInit(): void {}

  static show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3500): void {
    if (ToastNotificationComponent.instance) {
      ToastNotificationComponent.instance.showMessage(message, type, duration);
    }
  }

  showMessage(message: string, type: 'success' | 'error' | 'warning' | 'info', duration: number): void {
    const id = this.messageIdCounter++;
    const toast = { id, message, type, duration };
    this.messages.push(toast);

    setTimeout(() => {
      this.removeMessage(id);
    }, duration);
  }

  removeMessage(id: number): void {
    this.messages = this.messages.filter(msg => msg.id !== id);
  }

  getIcon(type: string): string {
    switch (type) {
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'info';
    }
  }
}
