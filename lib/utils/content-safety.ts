const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}/i;
const ADDRESS_REGEX = /\b\d{1,5}\s+[A-Za-z0-9.\-\s]{2,40}\s(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|circle|cir|place|pl|way)\b/i;

export function hasSuspiciousPersonalInfo(value: string) {
  return PHONE_REGEX.test(value) || ADDRESS_REGEX.test(value);
}

export function getPersonalInfoWarning() {
  return "Suspicious activity reports cannot include phone numbers or street addresses.";
}
