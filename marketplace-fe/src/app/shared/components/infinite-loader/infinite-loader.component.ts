import {AfterContentInit, Component, Input, OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import {BehaviorSubject} from "rxjs";
import {EventListener, EventService} from "hateoas-utils";
import {INFINITE_LOADER_EVENT} from "../../enums/const";
import {MatProgressBarModule } from '@angular/material/progress-bar';


@Component({
  selector: 'app-infinite-loader',
  templateUrl: './infinite-loader.component.html',
  styleUrls: ['./infinite-loader.component.css'],
  standalone: true,
  imports:[
    CommonModule,
    MatProgressBarModule
  ]
})
export class InfiniteLoaderComponent extends EventListener {

  started: boolean = false;

  @Input() methodAllowedToStartInfiniteLoader: string[] = ['GET', 'POST', 'PUT', 'PATCH']

  loaderBar$ = new BehaviorSubject<{ isEnabled: boolean, counter: number }>({isEnabled: false, counter: 0});

  constructor(public override eventService: EventService) {
    super(eventService);
    this.eventSubscribe();
    this.fmap.set(INFINITE_LOADER_EVENT.START_INFINITE_LOADER, this.startLoaderBar.bind(this));
    this.fmap.set(INFINITE_LOADER_EVENT.STOP_INFINITE_LOADER, this.stopLoaderBar.bind(this));
    this.fmap.set(INFINITE_LOADER_EVENT.RESET_INFINITE_LOADER, this.resetLoaderBar.bind(this));
  }


  startLoaderBar(payload: any) {
    if (this.checkIfRequestMetothIsAllowed(payload)) {
      this.loaderBar$.next({
        isEnabled: true,
        counter: this.loaderBar$.value.counter + 1
      });
    }
  }

  stopLoaderBar(payload: any) {
    if (this.checkIfRequestMetothIsAllowed(payload)) {
      let reset = false
      this.loaderBar$.next({
        isEnabled: (this.loaderBar$.value.counter <= 1 || reset === false) ? false : true,
        counter: (this.loaderBar$.value.counter <= 1 || reset === false) ? this.loaderBar$.value.counter - 1 : 0
      });
    }
  }

  resetLoaderBar() {
    this.loaderBar$.next({isEnabled: false, counter: 0});
  }

  checkIfRequestMetothIsAllowed(payload: any): boolean {
    return this.methodAllowedToStartInfiniteLoader.map(x => String(x).toUpperCase()).includes(String(payload).toUpperCase());
  }

  // getStatusLoaderBar(): BehaviorSubject<any>{
  //   return this.loaderBar$;
  // }

}
