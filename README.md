
# Atomic Loans Ethereum Contracts

Loan Contracts

## How to run

### Requirements

- Git
- Node.Js
- Truffle

Steps:

```
git clone https://github.com/AtomicLoans/ethereum-contracts.git
cd ethereum-contracts
npm install
```

Now run the tests:

`truffle test`

## License

MIT

## Glosary

`Fund`
```
Actions:

   gen             generate secret hashes for loan fund
   open            create new loan fund
   pull            remove excess toks from fund
   push            post additional toks to fund
   req             request loan from fund
   set             update loan fund request details


Getters:

   agent           optional automated agent
   bal             locked amount of tok in fund
   lfee            optional automation fee
   lint            interest rate
   lpen            liquidation penalty
   mala            max loan amount
   mald            max loan duration
   mila            min loan amount
   mild            min loan duration
   own             loan fund owner
   rat             liquidation ratio
   tok             debt token
   vars            variable contract


Vars:

   fundi           get the last fund id
   pubks           address pubkeys
   sechs           address secret hashes
   sechi           address secret hash index
   tokas           loan contract approved for token

```


`Loan`
```
Actions:

   mark            mark collateral as locked
   open            create new loan
   pay             repay debt
   pull            accept or cancel loan and remove funds
   push            fund loan
   sell            auction loan collateral in case of liquidation or default
   setSechs        set secret hashes for loan
   take            withdraw loan
   unpay           refund debt repayment 


Getters:

   acex            acceptance expirataion
   agent           optional automation agent address
   apex            approval expiraation
   back            amount paid back for loan
   biex            bidding expiration
   bor             borrower address
   col             collateral amount
   colv            current collateral value
   dedu            deductible amount from collateral
   lend            lender address
   lent            amount lent by lender
   lfee            optional fee paid to automator agent if address not 0x0
   lint            loan interest
   lpen            liquidation penalty in case not safe or defaulted
   min             minimum collateral value to be safe
   off             loan repayment accepted or loan cancelled
   owed            prin + lint + lfee
   prin            loan principal
   pushed          loan funded
   rat             liquidation ratio
   safe            loan is safe from liquidation


Vars:

   fundi           loan fund index
   backs           amount of loan paid back
   asaex           auction expirations by loan index
   loani           get the last loan id
   tokas           erc20 approved by address
```


