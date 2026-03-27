const testModule = process.env.TEST_MODULE ?? 'all';

if (testModule === 'all' || testModule === 'smoke') {
  require('./app.smoke.test');
}

if (testModule === 'all' || testModule === 'auth') {
  require('./contracts/auth.contract.test');
}

if (testModule === 'all' || testModule === 'companies') {
  require('./contracts/companies.contract.test');
}

if (testModule === 'all' || testModule === 'catalog') {
  require('./contracts/catalog.contract.test');
}

if (testModule === 'all' || testModule === 'routes') {
  require('./contracts/routes.contract.test');
}

if (testModule === 'all' || testModule === 'orders') {
  require('./contracts/orders.contract.test');
}

if (testModule === 'all' || testModule === 'reports') {
  require('./contracts/reports.contract.test');
}
