export const calculateIsJoinPresent = (join) => {
  return !!(join?.sources && Object.keys(join.sources).length > 0);
};
