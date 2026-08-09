export const businessCategories = [
  ["cafe", "Cafe"],
  ["restaurant", "Restaurant"],
  ["retail", "Retail"],
  ["fitness", "Fitness"],
  ["healthcare", "Healthcare"],
  ["hospitality", "Hospitality"],
  ["professional-services", "Professional services"],
  ["other", "Other"],
] as const;

export const adCategoryExclusions = [
  ["adult", "Adult content"],
  ["alcohol", "Alcohol"],
  ["cryptocurrency", "Cryptocurrency"],
  ["gambling", "Gambling"],
  ["healthcare", "Healthcare"],
  ["political", "Political campaigns"],
  ["tobacco", "Tobacco and nicotine"],
] as const;

export const operatingDays = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

export const businessCategoryValues = businessCategories.map(([value]) => value);
export const adCategoryExclusionValues = adCategoryExclusions.map(([value]) => value);
export const operatingDayValues = operatingDays.map(([value]) => value);
