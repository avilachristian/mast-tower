// Reject responses belonging to a previous login before they reach any store.
let epoch = 0;
export const currentSessionEpoch = () => epoch;
export const invalidateSessionRequests = () => {
  epoch += 1;
};
