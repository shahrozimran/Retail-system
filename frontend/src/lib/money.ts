const formatter = new Intl.NumberFormat('en-PK', {
  style: 'currency', currency: 'PKR', currencyDisplay: 'code',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const formatMoney = (value: number) => formatter.format(value).replace(/\u00a0/g, ' ');
