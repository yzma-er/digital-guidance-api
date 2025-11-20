const bcrypt = require('bcryptjs');

const plainPassword = '123456'; // Or whatever password you want

bcrypt.hash(plainPassword, 10).then((hash) => {
  console.log('Hashed password:', hash);
});
