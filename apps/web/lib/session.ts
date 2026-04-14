"use client";

export const accessTokenKey = "cryptopay_access_token";

export const getAccessToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(accessTokenKey);
};

export const setAccessToken = (value: string) => {
  window.localStorage.setItem(accessTokenKey, value);
};

export const clearAccessToken = () => {
  window.localStorage.removeItem(accessTokenKey);
};
