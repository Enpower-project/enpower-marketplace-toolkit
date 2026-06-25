export interface HateoasLink {
  href: string;
}

export interface HateoasLinks {
  self: HateoasLink;
  [key: string]: HateoasLink;
}

export interface HateoasResource<T> {
  _links: HateoasLinks;
  [key: string]: any;
}

export interface PageInfo {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface HateoasCollection<T> {
  _embedded: {
    [key: string]: T[];
  };
  _links: HateoasLinks;
  page: PageInfo;
}