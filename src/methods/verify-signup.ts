import { BadRequest } from '@feathersjs/errors';
import makeDebug from 'debug';
import {
  ensureObjPropsValid,
  ensureValuesAreStrings,
  getUserData,
  notify,
  isDateAfterNow
} from '../helpers';

import type {
  SanitizedUser,
  VerifySignupOptions,
  VerifySignupWithShortTokenOptions,
  Tokens,
  User,
  IdentifyUser,
  NotifierOptions
} from '../types';

const debug = makeDebug('authLocalMgnt:verifySignup');

export async function verifySignupWithLongToken (
  options: VerifySignupOptions,
  verifyToken: string,
  notifierOptions: NotifierOptions = {}
): Promise<SanitizedUser> {
  ensureValuesAreStrings(verifyToken);

  const result = await verifySignup(
    options,
    { verifyToken },
    { verifyToken },
    notifierOptions
  );
  return result;
}

export async function verifySignupWithShortToken (
  options: VerifySignupWithShortTokenOptions,
  verifyShortToken: string,
  identifyUser: IdentifyUser,
  notifierOptions: NotifierOptions = {}
): Promise<SanitizedUser> {
  ensureValuesAreStrings(verifyShortToken);
  ensureObjPropsValid(identifyUser, options.identifyUserProps);

  const result = await verifySignup(
    options,
    identifyUser,
    { verifyShortToken },
    notifierOptions
  );
  return result;
}

async function verifySignup (
  options: VerifySignupOptions,
  identifyUser: IdentifyUser,
  tokens: Tokens,
  notifierOptions: NotifierOptions = {}
): Promise<SanitizedUser> {
  debug('verifySignup', identifyUser, tokens);

  const {
    app,
    sanitizeUserForClient,
    service,
    notifier
  } = options;

  const usersService = app.service(service);
  const usersServiceId = usersService.id;

  const users = await usersService.find({ query: Object.assign({ $limit: 2 }, identifyUser) });
  const user1 = getUserData(users, [
    'isNotVerifiedOrHasVerifyChanges',
    'verifyNotExpired'
  ]);

  if (!Object.keys(tokens).every(key => tokens[key] === user1[key])) {
    await eraseVerifyProps(user1, user1.isVerified);

    throw new BadRequest(
      'Invalid token. Get for a new one. (authLocalMgnt)',
      { errors: { $className: 'badParam' } }
    );
  }

  const user2 = await eraseVerifyProps(user1, isDateAfterNow(user1.verifyExpires), user1.verifyChanges || {});
  const user3 = await notify(notifier, 'verifySignup', user2, notifierOptions);
  return sanitizeUserForClient(user3);

  async function eraseVerifyProps (
    user: User,
    isVerified: boolean,
    verifyChanges?: Record<string, any>
  ): Promise<User> {
    const patchToUser = Object.assign({}, verifyChanges ?? {}, {
      isVerified,
      verifyToken: null,
      verifyShortToken: null,
      verifyExpires: null,
      verifyChanges: {}
    });

    const result = await usersService.patch(user[usersServiceId], patchToUser, {});
    return result;
  }
}