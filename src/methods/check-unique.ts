import { BadRequest } from '@feathersjs/errors';
import isNullsy from '../helpers/is-nullsy';
import makeDebug from 'debug';

import type { Id } from '@feathersjs/feathers';
import type {
  CheckUniqueOptions,
  IdentifyUser,
  UsersArrayOrPaginated
} from '../types';

const debug = makeDebug('authLocalMgnt:checkUnique');

/**
 * This module is usually called from the UI to check username, email, etc. are unique.
 */
export default async function checkUnique (
  options: CheckUniqueOptions,
  identifyUser: IdentifyUser,
  ownId?: Id,
  meta?: { noErrMsg?: boolean}
): Promise<null> {
  debug('checkUnique', identifyUser, ownId, meta);

  const {
    app,
    service
  } = options;

  ownId = ownId || null;
  meta = meta || {};

  const usersService = app.service(service);
  const usersServiceId = usersService.id;
  const errProps = [];

  const keys = Object.keys(identifyUser).filter(
    key => !isNullsy(identifyUser[key])
  );

  try {
    for (let i = 0, ilen = keys.length; i < ilen; i++) {
      const prop = keys[i];
      const params = { query: { [prop]: identifyUser[prop].trim(), $limit: 0 }, paginate: { default: 1 } };
      if (!isNullsy(ownId)) {
        params.query[usersServiceId] = { $ne: ownId };
      }
      const users: UsersArrayOrPaginated = await usersService.find(params);
      const length = Array.isArray(users) ? users.length : users.total;
      const isNotUnique = length > 0;

      if (isNotUnique) {
        errProps.push(prop);
      }
    }
  } catch (err) {
    throw new BadRequest(
      meta.noErrMsg ? null : 'checkUnique unexpected error.',
      { errors: { msg: err.message, $className: 'unexpected' } }
    );
  }

  if (errProps.length) {
    const errs = {};
    errProps.forEach(prop => { errs[prop] = 'Already taken.'; });

    throw new BadRequest(
      meta.noErrMsg ? null : 'Values already taken.',
      { errors: errs }
    );
  }

  return null;
}
