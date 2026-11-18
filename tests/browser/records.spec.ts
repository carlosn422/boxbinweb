import { test, expect } from '@playwright/test';
import { setup, en, owner } from './records-fixture';

test('QR creation sends IDs and persists after reload; failed writes keep the dialog open',async({page})=>{
 const state=await setup(page);
 await page.goto('/smart-labels');
 await page.getByRole('button',{name:en.smartLabels.createLabel,exact:true}).click();
 await page.getByRole('spinbutton').fill('2');
 state.fail='POST:qrcodes';
 await page.getByRole('button',{name:/Generate 2 Labels/i}).click();
 await expect(page.getByText(/Write denied for test/)).toBeVisible();
 await expect(page.getByRole('spinbutton')).toHaveValue('2');
 expect(state.rows.qrcodes).toHaveLength(0);
 state.fail='';
 await page.getByRole('button',{name:/Generate 2 Labels/i}).click();
 await expect.poll(()=>state.rows.qrcodes.length).toBe(2);
 for(const row of state.rows.qrcodes) { expect(row.id).toMatch(/^[0-9a-f-]{36}$/);expect(row.userId).toBe(owner); }
 await page.reload();
 for(const row of state.rows.qrcodes) await expect(page.getByText(row.qrcodeId,{exact:true})).toBeVisible();
});

test('Sharing shows errors and only confirms revocation after a persisted deletion',async({page})=>{
 const state=await setup(page);
 await page.goto('/shared');
 await page.getByRole('button',{name:en.shareAccess.addNew,exact:true}).click();
 await page.getByPlaceholder(en.shareAccess.inputPlaceholder).fill('friend');
 state.fail='SHARE';
 await page.getByRole('button',{name:en.shareAccess.share,exact:true}).last().click();
 await expect(page.getByText(/Share denied for test/)).toBeVisible();
 expect(state.rows.shared_access).toHaveLength(0);
 await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
 state.fail='';
 await page.getByRole('button',{name:en.shareAccess.share,exact:true}).last().click();
 await expect.poll(()=>state.rows.shared_access.length).toBe(1);
 await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:/Shared by Me/}).click();
 page.on('dialog',dialog=>dialog.accept());
 state.fail='DELETE:shared_access';
 await page.getByRole('button',{name:en.shareAccess.revoke,exact:true}).click();
 await expect(page.getByText(/Write denied for test/)).toBeVisible();
 expect(state.rows.shared_access).toHaveLength(1);
 await page.getByRole('alertdialog').getByRole('button',{name:'OK',exact:true}).click();
 state.fail='';
 await page.getByRole('button',{name:en.shareAccess.revoke,exact:true}).click();
 await expect.poll(()=>state.rows.shared_access.length).toBe(0);
});
