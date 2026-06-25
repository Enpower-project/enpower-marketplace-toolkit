import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ValidationException } from '../exceptions/validation.exception';
import { ErrorCode } from '../enums/error-code.enum';

@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const validationErrors = errors.map(error => {
        const property = error.property;
        const constraints = error.constraints ?? {};
        const constraintKeys = Object.keys(constraints);
        const message = constraintKeys.length > 0
          ? constraints[constraintKeys[0]]
          : `Validation failed for property: ${property}`;

        return new ValidationException(
          ErrorCode.INVALID_DATA,
          metatype.name.toLowerCase().replace('dto', ''),
          property,
          error.value,
          message
        );
      });

      throw validationErrors[0];
    }

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}