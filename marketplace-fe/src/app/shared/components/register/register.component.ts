import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule,RouterModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  registerForm: FormGroup;
  message = '';
  apiGatewayUrl = environment.apiGatewayUrl

  constructor(private fb: FormBuilder, private http: HttpClient, private router: Router) {
    this.registerForm = this.fb.group({
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      // role: ['', Validators.required],
    });
  }

  onSubmit() {
    if (this.registerForm.valid) {
      const payload = this.registerForm.value;
      this.http
        .post(`${this.apiGatewayUrl}/auth/register`, payload) // Cambia el puerto si es necesario
        .subscribe({
          next: () => {
            (this.message = 'User registered successfully!'),
            () => {},
            this.router.navigate(['/home']);
          },
          error: (err) => (this.message = 'Registration failed.'),
        });
    }
  }
}
