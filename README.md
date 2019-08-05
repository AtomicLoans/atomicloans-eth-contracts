
# Atomic Loans Ethereum Contracts

[![Build Status](https://travis-ci.org/AtomicLoans/atomicloans-eth-contracts.svg?branch=master)](https://travis-ci.org/AtomicLoans/atomicloans-eth-contracts)
[![Coverage Status](https://coveralls.io/repos/github/AtomicLoans/atomicloans-eth-contracts/badge.svg)](https://coveralls.io/github/AtomicLoans/atomicloans-eth-contracts)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](./LICENSE.md)
[![Telegram](https://img.shields.io/badge/chat-on%20telegram-blue.svg)](https://t.me/Atomic_Loans)
[![Greenkeeper badge](https://badges.greenkeeper.io/AtomicLoans/atomicloans-eth-contracts.svg)](https://greenkeeper.io/)

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

## Glossary

### `Fund`
```
Actions:

   generate        generate secret hashes for loan fund
   create          create new loan fund
   withdraw        withdraw unused funds from the loan fund
   push            post additional toks to fund
   request         request loan from fund
   update          update loan fund request details


Getters:

   agent           optional automated agent
   balance         amount of unused funds deposited in loan fund
   fee             optional automation fee
   interest        interest rate
   penalty         liquidation penalty
   maxLoanAmt      max loan amount
   maxLoanDur      max loan duration
   minLoanAmt      min loan amount
   minLoanDur      min loan duration
   deployer        loan fund owner
   rat             liquidation ratio
   tok             debt token
   vars            variable contract


Vars:

   fundIndex       get the last fund id
   pubKeys         address pubkeys
   secretHashes    address secret hashes
   secretHashIndex address secret hash index

```


### `Loan`
```
Actions:

   approve         approve locking of collateral
   create          create new loan
   repay           repay debt
   accept          accept loan and remove funds
   cancel          cancel loan and remove funds
   fund            fund loan
   liquidate       auction loan collateral in case of liquidation or default
   setSecretHashes set secret hashes for loan
   withdraw        withdraw loan
   refund          refund debt repayment 


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
   fee             optional fee paid to automator agent if address not 0x0
   interest        loan interest rate
   penalty         liquidation penalty in case not safe or defaulted
   min             minimum collateral value to be safe
   off             loan repayment accepted or loan cancelled
   owed            prin + interest + fee
   prin            loan principal
   pushed          loan funded
   rat             liquidation ratio
   safe            loan is safe from liquidation


Vars:

   fundIndex       loan fund index
   backs           amount of loan paid back
   asaex           auction expirations by loan index
   loani           get the last loan id

```

### `Sales`
```
Actions:

   create          create new auction (can only be called by loan)
   push            bid on collateral
   sec             provide secret
   sign            provide signature to move collateral to collateral swap
   take            withdraw bid (accept bid and disperse funds to rightful parties)
   unpush          refund bid


Getters:

   agent           optional automated agent
   asigRbsig       agent refundable back signature
   asigRsig        agent refundable signature
   asigSbsig       agent seizable back signature
   asigSsig        agent seizable signature
   bid             current bid
   bidr            address current bidder
   bor             address borrower
   bsigRbsig       borrower refundable back signature
   bsigRsig        borrower refundable signature
   bsigSbsig       borrower seizable back signature
   bsigSsig        borrower seizable signature
   hasSecs         2 of 3 secrets from bor, lend, and agent are correct
   lend            address lender
   lsigRbsig       lender refundable back signature
   lsigRsig        lender refundable signature
   lsigSbsig       lender seizable back signature
   lsigSsig        lender seizable signature
   next            get the last auction id by loan
   pbkh            bidder pubkeyhash
   salex           auction bidding expiration
   secA            Secret A
   secB            Secret B
   secC            Secret C
   secD            Secret D
   sechA           Secret Hash A
   sechB           Secret Hash B
   sechC           Secret Hash C
   sechD           Secret Hash D
   setex           auction settlement expiration
   taken           winning bid accepted


Vars:

   salel           loan auction (find by loani)

```

