import { QueryParamsHandling } from '@angular/router';

export interface BreadCrumbInterface {
  title: string;
  routerLink?: string;
  queryParams?: Object;
  queryParamsHandling?: QueryParamsHandling;
}

export interface MenuElementInterface {
  routerLink: string;
  materialIcon?: string;
  svgIcon?: string;
  name: string;
  rolesEnabled?: Array<string>;
  className?: String;
  bottom?: boolean;
  event?: string;
  breadcrumbElements?: BreadCrumbInterface[];
  type?: string;
  queryParams?: object;
  cyData?: string;
}

/**
 * A navigation entry. The definition is kept under `value` and its fields are
 * also copied onto the instance, so both `item.value.name` and `item.name`
 * resolve.
 */
export class MenuElement {
  constructor(public value: MenuElementInterface) {
    Object.assign(this, value);
  }
}
