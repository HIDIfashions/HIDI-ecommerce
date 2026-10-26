import assert from 'node:assert/strict';

// SQL-owner probes exercise the triggers themselves, beyond runtime DENY.
// Each case creates disposable records and always rolls its transaction back.
export async function verifyGuards(pool, sql) {
  const fixture = `
    DECLARE @id nvarchar(64)=CONVERT(nvarchar(64),NEWID());
    INSERT dbo.[User] (id,email,role,marketingOptIn,createdAt,updatedAt)
      VALUES (@id,@id+'@example.invalid','CUSTOMER',0,SYSUTCDATETIME(),SYSUTCDATETIME());
    INSERT dbo.WalletAccount (id,authSubject,userId,currency,balancePaise,reservedPaise,createdAt,updatedAt)
      VALUES (@id,@id,@id,'INR',100,0,SYSUTCDATETIME(),SYSUTCDATETIME());
    INSERT dbo.[Order] (id,orderNumber,status,currency,subtotalPaise,discountPaise,shippingPaise,taxPaise,totalPaise,walletAppliedPaise,customerPhone,shippingAddress,createdAt,updatedAt)
      VALUES (@id,@id,'PENDING_PAYMENT','INR',100,0,0,0,100,0,'0000000000','{}',SYSUTCDATETIME(),SYSUTCDATETIME());
    INSERT dbo.WalletLedger (id,walletId,orderId,kind,deltaPaise,eventKey,createdAt)
      VALUES (@id,@id,@id,'EARN',100,@id,SYSUTCDATETIME());
    INSERT dbo.OrderAuditEvent (id,orderId,eventType,actorType,createdAt)
      VALUES (@id,@id,'SECURITY_ROLLBACK','ADMIN',SYSUTCDATETIME());
    DECLARE @archive nvarchar(max)=(SELECT
      JSON_QUERY((SELECT * FROM dbo.WalletLedger WHERE id=@id FOR JSON PATH)) AS WalletLedger,
      JSON_QUERY((SELECT * FROM dbo.OrderAuditEvent WHERE id=@id FOR JSON PATH)) AS OrderAuditEvent
      FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
    INSERT dbo.AdminSalesDeletion (id,actorEmail,cutoff,orderCount,archiveJson)
      VALUES (@id,'fashionshidi@gmail.com',SYSUTCDATETIME(),1,@archive);
    EXEC sys.sp_set_session_context @key=N'hidi_sales_archive',@value=@id;
  `;
  const cases = [
    "UPDATE dbo.WalletLedger SET orderId=NULL,deltaPaise=999 WHERE id=@id;",
    "DELETE FROM dbo.WalletLedger WHERE id=@id;",
    "UPDATE dbo.OrderAuditEvent SET eventType='CHANGED' WHERE id=@id;",
    "EXEC sys.sp_set_session_context @key=N'hidi_sales_archive',@value=NULL; DELETE FROM dbo.OrderAuditEvent WHERE id=@id;",
    "EXEC sys.sp_set_session_context @key=N'hidi_sales_archive',@value=NULL; UPDATE dbo.WalletLedger SET orderId=NULL WHERE id=@id;",
  ];
  for (const mutation of cases) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let failure;
    try { await new sql.Request(transaction).batch(fixture + mutation); }
    catch (error) { failure = error; }
    finally {
      try { await new sql.Request(transaction).query("EXEC sys.sp_set_session_context @key=N'hidi_sales_archive',@value=NULL;"); } catch {}
      try { await transaction.rollback(); } catch {}
    }
    assert.equal(failure?.number,51000,'Expected append-only trigger rejection');
  }
  return {passed:true,checks:cases.length,rollbackOnly:true};
}
